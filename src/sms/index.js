/**
 * Twilio SMS Service
 *
 * Handles:
 *  - sendSMS(to, body)          — send a single message
 *  - broadcastDigest(digest)    — send weekly digest to all subscribers
 *  - parseInboundKeyword(body)  — detect STOP / START / HELP keywords
 */
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);

const FROM_NUMBER = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send a single SMS message.
 *
 * @param {string} to    E.164 phone number, e.g. "+13185551234"
 * @param {string} body  Message text (Twilio auto-concatenates >160 chars)
 * @returns {Promise<string>} Twilio message SID
 */
export async function sendSMS(to, body) {
  try {
    const msg = await client.messages.create({
      from: FROM_NUMBER,
      to,
      body: body.slice(0, 1600), // hard cap for safety
    });
    console.log(`[sms] Sent to ${to}: ${msg.sid}`);
    return msg.sid;
  } catch (err) {
    console.error(`[sms] Failed to send to ${to}: ${err.message}`);
    throw err;
  }
}

/**
 * Broadcast the weekly digest to all subscribers.
 *
 * @param {string}   digest        The full digest text
 * @param {Array<{phone: string}>} subscribers  List of user rows
 * @returns {Promise<{sent: number, failed: number}>}
 */
export async function broadcastDigest(digest, subscribers) {
  let sent = 0;
  let failed = 0;

  console.log(`[sms] Broadcasting to ${subscribers.length} subscriber(s)…`);

  // Send in batches of 10 to avoid rate limiting
  const BATCH_SIZE = 10;
  for (let i = 0; i < subscribers.length; i += BATCH_SIZE) {
    const batch = subscribers.slice(i, i + BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (user) => {
        try {
          await sendSMS(user.phone, digest);
          sent++;
        } catch {
          failed++;
        }
      }),
    );
    // Brief pause between batches
    if (i + BATCH_SIZE < subscribers.length) {
      await sleep(1000);
    }
  }

  console.log(`[sms] Broadcast complete — sent: ${sent}, failed: ${failed}`);
  return { sent, failed };
}

/**
 * Parse inbound SMS for subscription-control keywords.
 *
 * @param {string} body  Raw SMS body
 * @returns {'stop'|'start'|'help'|null}
 */
export function parseInboundKeyword(body) {
  const normalized = (body || "").trim().toUpperCase();
  const cleaned = normalized
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const firstWord = cleaned.split(" ")[0] || "";

  if (["STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"].includes(firstWord))
    return "stop";
  if (
    ["START", "SUBSCRIBE", "YES", "UNSTOP", "CONFIRM", "Y"].includes(firstWord)
  )
    return "start";
  if (["HELP", "INFO"].includes(firstWord) || normalized === "?") return "help";
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
