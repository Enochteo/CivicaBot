/**
 * Supabase database — users, subscriptions, and conversation history.
 *
 * Expected tables:
 *   users          — phone (PK), subscribed (boolean), created_at
 *   conversations  — id, phone, role, content, created_at
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Missing Supabase config. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).",
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

function normalizeUser(row) {
  if (!row) return null;
  return {
    ...row,
    subscribed: row.subscribed ? 1 : 0,
  };
}

function normalizeUsers(rows = []) {
  return rows.map(normalizeUser);
}

function throwIfError(error, context) {
  if (error) {
    throw new Error(`[db] ${context}: ${error.message}`);
  }
}

// ── User management ───────────────────────────────────────────────────────────

/** Upsert a user. Returns the user row. */
export async function upsertUser(phone) {
  const { data, error } = await supabase
    .from("users")
    .upsert({ phone, subscribed: true }, { onConflict: "phone" })
    .select("*")
    .single();

  throwIfError(error, "upsertUser");
  return normalizeUser(data);
}

/** Mark a user as unsubscribed. */
export async function unsubscribeUser(phone) {
  const { error } = await supabase
    .from("users")
    .update({ subscribed: false })
    .eq("phone", phone);

  throwIfError(error, "unsubscribeUser");
}

/** Mark a user as re-subscribed. */
export async function resubscribeUser(phone) {
  const { error } = await supabase
    .from("users")
    .upsert({ phone, subscribed: true }, { onConflict: "phone" });

  throwIfError(error, "resubscribeUser");
}

/** Get a user by phone. Returns null if not found. */
export async function getUser(phone) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("phone", phone)
    .maybeSingle();

  throwIfError(error, "getUser");
  return normalizeUser(data);
}

/** Return all currently subscribed users. */
export async function getAllSubscribedUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("subscribed", true);

  throwIfError(error, "getAllSubscribedUsers");
  return normalizeUsers(data);
}

/** Return all users (for admin). */
export async function getAllUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  throwIfError(error, "getAllUsers");
  return normalizeUsers(data);
}

// ── Conversation history ──────────────────────────────────────────────────────

/**
 * Save a message to conversation history.
 * @param {string} phone
 * @param {'user'|'assistant'} role
 * @param {string} content
 */
export async function saveMessage(phone, role, content) {
  const { error } = await supabase
    .from("conversations")
    .insert({ phone, role, content });

  throwIfError(error, "saveMessage");
}

/**
 * Get recent conversation history for a user, formatted as Claude message params.
 * @param {string} phone
 * @param {number} limit  max number of messages to return
 * @returns {Array<{role: string, content: string}>}
 */
export async function getConversationHistory(phone, limit = 20) {
  const { data, error } = await supabase
    .from("conversations")
    .select("role, content, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(limit);

  throwIfError(error, "getConversationHistory");

  // Reverse so oldest is first (OpenAI expects chronological order)
  return (data || [])
    .reverse()
    .map((r) => ({ role: r.role, content: r.content }));
}

/**
 * Delete conversation messages older than `days` days for a user.
 */
export async function clearOldHistory(phone, days = 30) {
  const cutoff = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("phone", phone)
    .lt("created_at", cutoff);

  throwIfError(error, "clearOldHistory");
}

export default supabase;
