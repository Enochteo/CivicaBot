/**
 * OpenAI Agent
 *
 * Two responsibilities:
 *  1. generateWeeklyDigest(items) → crafts the Monday SMS summary from scraped data
 *  2. handleUserMessage(userPhone, message) → responds to an inbound SMS with
 *     context-aware civic Q&A, maintaining per-user conversation history.
 */
import OpenAI from "openai";
import {
  getConversationHistory,
  saveMessage,
  clearOldHistory,
} from "../db/index.js";
import { scrapeAll } from "../scrapers/index.js";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const CHAT_SYSTEM_PROMPT = `You are VotePlease, a friendly civic information assistant for residents of Grambling, Louisiana and Lincoln Parish. You help people stay informed about:
- Local Grambling city news and announcements
- Lincoln Parish events, meetings, and news
- Louisiana elections, voter registration, and voting locations
- Get-out-the-vote resources from the Power Coalition

Your personality is warm, encouraging, and civic-minded. You speak plainly and accessibly.

Rules:
- Keep SMS responses under 320 characters when possible (Twilio will concatenate longer messages).
- For weekly digests, aim for 600–900 characters total.
- Always encourage civic participation — voting, attending meetings, getting involved.
- Prioritize answering from the provided civic context when available.
- Never invent facts or dates. Only summarize what you've been given.
- If a user asks to STOP or UNSUBSCRIBE, confirm they've been removed.
- If a user asks to START or SUBSCRIBE, confirm they've been added.
- Give examples of questions a user can ask in your first response and whenever the user asks anything outside of your tasks.
DO NOT BE REPETITIVE IN YOUR RESPONSE
AVOID USING MARKDOWN FORMATTING
`;

let cachedContext = { at: 0, items: [] };
const CONTEXT_TTL_MS = 15 * 60 * 1000;

function isLowSignalItem(item) {
  const title = (item?.title || "").trim();
  const summary = (item?.summary || "").trim();
  const source = (item?.source || "").trim();

  if (!title || title.length < 8) return true;
  if (/facebook updates not configured/i.test(title)) return true;
  if (/this website uses cookies/i.test(title)) return true;
  if (
    /^(your government|police jury|public works|contact us|follow us)$/i.test(
      title,
    )
  )
    return true;
  if (!summary && !item?.date) return true;
  if (summary && summary.length < 20 && !item?.date) return true;
  if (!source) return true;

  return false;
}

function filterHighSignalItems(items) {
  return (items || []).filter((item) => !isLowSignalItem(item));
}

async function getFreshCivicContext() {
  const now = Date.now();
  if (
    cachedContext.items.length > 0 &&
    now - cachedContext.at < CONTEXT_TTL_MS
  ) {
    return cachedContext.items;
  }

  try {
    const items = await scrapeAll();
    const filtered = filterHighSignalItems(items).slice(0, 30);
    cachedContext = { at: now, items: filtered };
    return filtered;
  } catch (err) {
    console.warn("[agent] civic context refresh failed:", err.message);
    return cachedContext.items;
  }
}

function buildChatContext(items) {
  if (!items || items.length === 0)
    return "No current civic context available.";

  return items
    .slice(0, 25)
    .map((item) => {
      const parts = [`Source: ${item.source}`, `Title: ${item.title}`];
      if (item.date) parts.push(`Date: ${item.date}`);
      if (item.summary) parts.push(`Summary: ${item.summary.slice(0, 700)}`);
      if (item.url) parts.push(`URL: ${item.url}`);
      return parts.join(" | ");
    })
    .join("\n");
}

function getTodayLabel() {
  const timezone = process.env.TZ || "America/Chicago";
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });
}

function buildCombinedScrapedMarkdown(items) {
  return filterHighSignalItems(items)
    .slice(0, 30)
    .map((item) => {
      const lines = [
        `- Source: ${item.source || "Unknown source"}`,
        `  Title: ${item.title || "Untitled update"}`,
      ];

      if (item.date) lines.push(`  Date: ${item.date}`);
      if (item.summary) lines.push(`  Summary: ${item.summary}`);
      if (item.url) lines.push(`  Link: ${item.url}`);

      return lines.join("\n");
    })
    .join("\n\n");
}

function normalizeDigestText(text) {
  let output = (text || "").trim();

  // Remove links so residents receive actionable text without internet dependence.
  output = output
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .split("\n")
    .map((line) => line.replace(/\s{2,}/g, " ").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Hard cap to ensure Twilio payload stays below the required threshold.
  if (output.length > 1499) {
    output = `${output.slice(0, 1496).trimEnd()}...`;
  }

  return output;
}

/**
 * Generate a weekly SMS digest from scraped civic items.
 *
 * @param {Array<{source, title, summary, date, url}>} items
 * @returns {Promise<string>} SMS-ready digest text
 */
export async function generateWeeklyDigest(items) {
  if (!items || items.length === 0) {
    return "VotePlease Weekly Digest: No new upcoming civic updates were found this week. Reply START to join updates or STOP to opt out.";
  }

  const today = getTodayLabel();
  const combinedMarkdown = buildCombinedScrapedMarkdown(items);

  const digestSystemPrompt = `You are Civica, a nonpartisan civic information bot serving residents of Grambling, Louisiana and Lincoln Parish.

Your job is to curate civic information into a concise, SMS-friendly format for residents who may have limited internet access.

CRITICAL: Your response MUST be under 1500 characters total. Count carefully. Twilio SMS has a hard 1600 character limit and messages over this will fail to send.

The message must be:

UNDER 1500 CHARACTERS (this is a hard requirement - messages over this limit will fail)
Clear and easy to read on a phone
Nonpartisan and factual
Focused on actionable civic information (voting dates, registration deadlines, local meetings, community events)
Content rules:

ONLY include events happening today or in the future. Today is ${today}. Do NOT mention any events, deadlines, or meetings that have already passed.
Do NOT include website URLs or web links. Recipients have limited internet access. Instead, include physical addresses, phone numbers, or office hours where available so people can show up or call.
If no contact info is available for an item, just describe the event/deadline clearly without a link.
Use short paragraphs
Include dates and times clearly
Use simple language accessible to all reading levels
Skip promotional content or opinions`;

  const digestUserPrompt = `Here is the civic information scraped from local sources:\n\n${combinedMarkdown}\n\nPlease curate this into a weekly civic update SMS for Grambling, LA residents. Focus on the most important and time-sensitive information.`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 512,
      messages: [
        { role: "system", content: digestSystemPrompt },
        { role: "user", content: digestUserPrompt },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    const digest = normalizeDigestText(text);
    return (
      digest || "VotePlease: Weekly digest unavailable. Reply HELP for support."
    );
  } catch (err) {
    console.error("[agent] generateWeeklyDigest error:", err.message);
    return "VotePlease: Could not generate this week's digest. Reply HELP for support.";
  }
}

/**
 * Handle an inbound user message with full conversation history.
 *
 * @param {string} userPhone  E.164 phone number, e.g. "+13185551234"
 * @param {string} message    The user's SMS text
 * @returns {Promise<string>} Reply SMS text
 */
export async function handleUserMessage(userPhone, message) {
  // Retrieve recent conversation history (last 10 exchanges = 20 messages)
  const history = await getConversationHistory(userPhone, 20);
  const civicContextItems = await getFreshCivicContext();
  const civicContext = buildChatContext(civicContextItems);

  // Append the new user message
  const messages = [
    {
      role: "system",
      content: `Current civic context (use this first, and keep answers practical):\n${civicContext}`,
    },
    ...history,
    { role: "user", content: message },
  ];

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [{ role: "system", content: CHAT_SYSTEM_PROMPT }, ...messages],
    });

    const replyText =
      response.choices[0]?.message?.content?.trim() ||
      "Sorry, I couldn't process that. Try asking about local news, voting, or upcoming events.";

    // Persist both sides of the conversation
    await saveMessage(userPhone, "user", message);
    await saveMessage(userPhone, "assistant", replyText);

    // Prune old history periodically (keep last 30 days)
    await clearOldHistory(userPhone, 30);

    return replyText;
  } catch (err) {
    console.error("[agent] handleUserMessage error:", err.message);
    return "Sorry, I'm having trouble right now. Please try again later or visit cityofgrambling.org.";
  }
}
