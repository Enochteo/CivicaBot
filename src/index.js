/**
 * VotePlease — Main Entry Point
 *
 * Express server that:
 *  - Handles inbound Twilio SMS webhooks (POST /sms)
 *  - Exposes admin endpoints (POST /admin/trigger, GET /admin/users)
 *  - Exposes a health check (GET /health)
 *  - Starts the Monday morning cron scheduler
 */
import "dotenv/config";
import express from "express";
import twilio from "twilio";

import { startScheduler, runWeeklyPipeline } from "./scheduler/index.js";
import { handleUserMessage } from "./agent/index.js";
import { sendSMS, parseInboundKeyword } from "./sms/index.js";
import {
  upsertUser,
  unsubscribeUser,
  resubscribeUser,
  getUser,
  getAllUsers,
  getAllSubscribedUsers,
} from "./db/index.js";

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED_ENV = [
  "OPENAI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required env vars: ${missing.join(", ")}`);
  console.error(
    "[startup] Copy .env.example → .env and fill in your credentials.",
  );
  process.exit(1);
}

const app = express();
app.use(express.urlencoded({ extended: false })); // Twilio sends URL-encoded bodies
app.use(express.json());

const PORT = process.env.PORT || 3000;

function trimTrailingSlash(url = "") {
  return url.replace(/\/+$/, "");
}

function buildValidationUrls(req) {
  const baseFromEnv = process.env.WEBHOOK_URL
    ? trimTrailingSlash(process.env.WEBHOOK_URL)
    : null;
  const baseFromRequest = `${req.protocol}://${req.get("host")}`;
  const pathOnly = req.path || "/sms";
  const originalUrl = req.originalUrl || pathOnly;

  const candidates = new Set();

  if (baseFromEnv) {
    candidates.add(`${baseFromEnv}${pathOnly}`);
    candidates.add(`${baseFromEnv}${trimTrailingSlash(pathOnly)}`);
    candidates.add(`${baseFromEnv}${originalUrl}`);
  }

  candidates.add(`${baseFromRequest}${pathOnly}`);
  candidates.add(`${baseFromRequest}${trimTrailingSlash(pathOnly)}`);
  candidates.add(`${baseFromRequest}${originalUrl}`);

  return [...candidates];
}

// ── Twilio request validation middleware ──────────────────────────────────────
// Validates that inbound requests genuinely come from Twilio.
// Set TWILIO_VALIDATE_REQUESTS=false to skip validation during local dev.
function twilioValidation(req, res, next) {
  if (process.env.TWILIO_VALIDATE_REQUESTS === "false") return next();

  const signature = req.headers["x-twilio-signature"] || "";
  const params = req.method === "GET" ? req.query : req.body;
  const candidateUrls = buildValidationUrls(req);

  const isValid = candidateUrls.some((url) =>
    twilio.validateRequest(
      process.env.TWILIO_AUTH_TOKEN,
      signature,
      url,
      params,
    ),
  );

  if (!isValid) {
    console.warn("[webhook] Invalid Twilio signature — rejecting request");
    console.warn(`[webhook] method=${req.method} path=${req.originalUrl}`);
    console.warn(
      `[webhook] host=${req.get("host")} signaturePresent=${signature ? "yes" : "no"}`,
    );
    console.warn(`[webhook] checked URLs: ${candidateUrls.join(", ")}`);
    return res.status(403).send("Forbidden");
  }
  next();
}

// ── /sms — Inbound SMS webhook (supports GET/POST for resilience) ───────────
app.all(["/sms", "/sms/"], twilioValidation, async (req, res) => {
  const payload = req.method === "GET" ? req.query : req.body;
  const from = payload.From; // e.g. "+13185551234"
  const body = (payload.Body || "").trim();

  console.log(`[webhook] Inbound SMS from ${from}: "${body}"`);

  // Always respond with valid TwiML (even if empty) to satisfy Twilio
  const twiml = new twilio.twiml.MessagingResponse();

  if (!from) {
    return res.type("text/xml").send(twiml.toString());
  }

  try {
    const keyword = parseInboundKeyword(body);
    const user = await getUser(from);

    if (keyword === "stop") {
      if (!user) await upsertUser(from);
      await unsubscribeUser(from);
      twiml.message(
        "You have been unsubscribed from VotePlease. Reply START to re-subscribe anytime.",
      );
    } else if (keyword === "start") {
      await resubscribeUser(from);
      twiml.message(
        "Confirmed. You are now on the VotePlease list for Monday civic updates in Grambling & Lincoln Parish. Reply STOP to unsubscribe, HELP for info. Try asking: 'When is the next Grambling city council meeting?'",
      );
    } else if (keyword === "help") {
      twiml.message(
        "VotePlease sends a weekly civic digest for Grambling, LA and can answer local civic questions by text. Example questions: 'How do I register to vote in Lincoln Parish?', 'When is early voting?', 'What is on the local ballot?' Reply START to join updates or STOP to opt out.",
      );
    } else {
      if (!user) {
        twiml.message(
          "Welcome to VotePlease. Reply START, YES, or CONFIRM to join Monday civic updates for Grambling, LA. You can also ask: 'Where is my polling place?' or 'When is the next election?' Reply STOP to opt out.",
        );
      } else if (user.subscribed === 0) {
        twiml.message("You are unsubscribed. Reply START to re-subscribe.");
      } else {
        // Route to the AI agent
        try {
          const reply = await handleUserMessage(from, body);
          twiml.message(reply);
        } catch (err) {
          console.error("[webhook] Agent error:", err.message);
          twiml.message("Sorry, something went wrong. Please try again later.");
        }
      }
    }
  } catch (err) {
    console.error("[webhook] Database error:", err.message);
    twiml.message("Sorry, something went wrong. Please try again later.");
  }

  res.type("text/xml").send(twiml.toString());
});

// ── GET /health ───────────────────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  try {
    const subscribers = await getAllSubscribedUsers();
    res.json({
      status: "ok",
      service: "VotePlease",
      timestamp: new Date().toISOString(),
      subscribers: subscribers.length,
    });
  } catch (err) {
    res.status(500).json({ status: "error", error: err.message });
  }
});

// ── Admin endpoints (protect with API key in production) ──────────────────────

function adminAuth(req, res, next) {
  const key = req.headers["x-admin-key"];
  if (process.env.ADMIN_API_KEY && key !== process.env.ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/** Manually trigger the weekly pipeline */
app.post("/admin/trigger", adminAuth, async (req, res) => {
  console.log("[admin] Manual pipeline trigger requested");
  try {
    const result = await runWeeklyPipeline();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** List all users */
app.get("/admin/users", adminAuth, async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Subscribe a phone number */
app.post("/admin/subscribe", adminAuth, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "phone required" });
  try {
    const user = await upsertUser(phone);
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/** Send a custom SMS to a specific user */
app.post("/admin/send", adminAuth, async (req, res) => {
  const { phone, message } = req.body;
  if (!phone || !message)
    return res.status(400).json({ error: "phone and message required" });
  try {
    const sid = await sendSMS(phone, message);
    res.json({ success: true, sid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  VotePlease running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Twilio webhook: POST http://localhost:${PORT}/sms\n`);
  if (process.env.WEBHOOK_URL) {
    console.log(
      `   Public webhook base: ${trimTrailingSlash(process.env.WEBHOOK_URL)}`,
    );
  }

  // Start the Monday cron job
  startScheduler();
});
