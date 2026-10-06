/**
 * Telegram Bot API helpers for InstalecJG (pure-ish; network via fetch).
 *
 * Secrets used (Supabase Edge Function secrets, never commit values):
 * - TELEGRAM_BOT_TOKEN        bot token from @BotFather
 * - TELEGRAM_WEBHOOK_SECRET   value Telegram sends in X-Telegram-Bot-Api-Secret-Token
 * - TELEGRAM_OWNER_CODE       code for `/soyjorge <code>` to register the owner chat
 * - TELEGRAM_OWNER_CHAT_ID    optional; overrides the chat id stored in app_settings
 */

export const TG_CONTACT_PREFIX = "tg:";
export const OWNER_SETTING_KEY = "telegram_owner_chat_id";

/** @param {string|number} chatId */
export function telegramContactId(chatId) {
  return `${TG_CONTACT_PREFIX}${chatId}`;
}

/** @param {string} phoneNumberField contactos.phone_number */
export function telegramChatIdFromContact(phoneNumberField) {
  const v = String(phoneNumberField ?? "");
  return v.startsWith(TG_CONTACT_PREFIX) ? v.slice(TG_CONTACT_PREFIX.length) : null;
}

/** Constant-time-ish string comparison (avoid early exit on secrets). */
export function safeEqual(a, b) {
  const x = String(a ?? "");
  const y = String(b ?? "");
  if (!x || !y) return false;
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) {
    diff |= (x.charCodeAt(i % x.length) || 0) ^ (y.charCodeAt(i % y.length) || 0);
  }
  return diff === 0;
}

/**
 * Normalize a phone typed or shared by the user. Mexican 10-digit numbers get 52 prefix.
 * @returns {string|null} digits, or null if it does not look like a phone
 */
export function normalizePhone(raw) {
  let digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) digits = `52${digits}`;
  if (digits.startsWith("521") && digits.length === 13) digits = `52${digits.slice(3)}`;
  if (digits.length < 11 || digits.length > 15) return null;
  return digits;
}

/** Escape for parse_mode=HTML and turn WhatsApp-style *bold* into <b>. */
export function toTelegramHtml(text) {
  const esc = String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\*([^*\n]+)\*/g, "<b>$1</b>");
}

/** Reply keyboard with numbered options ("1) Solo cotización"). */
export function choiceKeyboard(buttons) {
  return {
    keyboard: buttons.map((b, i) => [{ text: `${i + 1}) ${b.title}` }]),
    one_time_keyboard: true,
    resize_keyboard: true,
  };
}

export function contactKeyboard() {
  return {
    keyboard: [[{ text: "📱 Compartir mi número", request_contact: true }]],
    one_time_keyboard: true,
    resize_keyboard: true,
  };
}

export const REMOVE_KEYBOARD = { remove_keyboard: true };

/**
 * Pressing a numbered keyboard button sends "2) Agendar visita"; map it to "2"
 * so parseCitaChoice / parseSlotSelection work exactly like WhatsApp numbered replies.
 */
export function normalizeKeyboardText(text) {
  const m = /^\s*([1-9])\)\s+/.exec(String(text ?? ""));
  return m ? m[1] : String(text ?? "").trim();
}

/**
 * Parse a bot command like "/soyjorge ABC123" or "/start@Instelecjgbot".
 * @returns {{ command: string, args: string } | null}
 */
export function parseCommand(text) {
  const m = /^\/([a-zA-Z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/.exec(String(text ?? "").trim());
  if (!m) return null;
  return { command: m[1].toLowerCase(), args: (m[2] ?? "").trim() };
}

/**
 * Extract the fields we care about from a Telegram Update.
 * @param {any} update
 */
export function extractTelegramInbound(update) {
  const msg = update?.message;
  if (!msg || !msg.chat) return null;
  const from = msg.from ?? {};
  const fullName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim();
  return {
    updateId: update.update_id,
    chatId: msg.chat.id,
    chatType: msg.chat.type,
    fromId: from.id,
    isBot: Boolean(from.is_bot),
    username: from.username ?? "",
    profileName: fullName,
    text: typeof msg.text === "string" ? msg.text : "",
    contactPhone: msg.contact?.phone_number ?? "",
    contactUserId: msg.contact?.user_id ?? null,
  };
}

/** Call a Telegram Bot API method. Never logs the token. */
export async function telegramApi(token, method, payload) {
  if (!token) {
    console.error("telegramApi: missing TELEGRAM_BOT_TOKEN");
    return { ok: false, description: "missing token" };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload ?? {}),
    });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) console.error(`telegram ${method} failed:`, json.description ?? res.status);
    return json;
  } catch (err) {
    console.error(`telegram ${method} error:`, String(err));
    return { ok: false, description: String(err) };
  }
}

export function sendTelegramMessage(token, chatId, text, replyMarkup) {
  const payload = {
    chat_id: chatId,
    text: toTelegramHtml(text),
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return telegramApi(token, "sendMessage", payload);
}

/**
 * Send a file (e.g. quote PDF) with sendDocument via multipart upload.
 * @param {string} token
 * @param {string|number} chatId
 * @param {Blob} file
 * @param {string} filename
 * @param {string} [caption] plain text (WhatsApp-style *bold* allowed), max 1024 chars
 */
export async function sendTelegramDocument(token, chatId, file, filename, caption) {
  if (!token) {
    console.error("sendTelegramDocument: missing TELEGRAM_BOT_TOKEN");
    return { ok: false, description: "missing token" };
  }
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("document", file, filename);
    if (caption) {
      form.append("caption", toTelegramHtml(caption));
      form.append("parse_mode", "HTML");
    }
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
    const json = await res.json().catch(() => ({ ok: false }));
    if (!json.ok) console.error("telegram sendDocument failed:", json.description ?? res.status);
    return json;
  } catch (err) {
    console.error("telegram sendDocument error:", String(err));
    return { ok: false, description: String(err) };
  }
}

/**
 * Owner chat id: secret TELEGRAM_OWNER_CHAT_ID wins; otherwise app_settings row
 * written by `/soyjorge <code>`. Returns "" if none.
 */
export async function getOwnerChatId(supabase, env = (k) => globalThis.Deno?.env.get(k)) {
  const fromEnv = (env("TELEGRAM_OWNER_CHAT_ID") ?? "").trim();
  if (fromEnv) return fromEnv;
  if (!supabase) return "";
  try {
    const { data, error } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", OWNER_SETTING_KEY)
      .maybeSingle();
    if (error) return "";
    return String(data?.value ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Notify Jorge on Telegram. Silently skips if token or owner chat id is missing.
 * Never throws.
 */
export async function notifyOwner(supabase, text, env = (k) => globalThis.Deno?.env.get(k)) {
  try {
    const token = env("TELEGRAM_BOT_TOKEN") ?? "";
    if (!token) return false;
    const chatId = await getOwnerChatId(supabase, env);
    if (!chatId) return false;
    const res = await sendTelegramMessage(token, chatId, text);
    return Boolean(res?.ok);
  } catch (err) {
    console.error("notifyOwner error:", String(err));
    return false;
  }
}

/** Build the owner notification text for a bot/web lead event. */
export function formatOwnerNotification({ tipo, canal, contacto, datos = {}, slotLabel = "", extra = "" }) {
  const titulo =
    tipo === "cita_pendiente"
      ? "📅 Nueva cita PENDIENTE (confírmala en el panel)"
      : tipo === "mensaje"
        ? "💬 Mensaje nuevo de un cliente"
        : "🆕 Nuevo lead / solicitud de cotización";
  const lines = [titulo, `Canal: ${canal}`];
  const nombre = datos.nombre || contacto?.nombre;
  if (nombre) lines.push(`Nombre: ${nombre}`);
  if (datos.telefono) lines.push(`Teléfono: ${datos.telefono}`);
  else if (contacto?.phone_number && !String(contacto.phone_number).startsWith(TG_CONTACT_PREFIX)) {
    lines.push(`Teléfono: ${contacto.phone_number}`);
  }
  if (datos.tipo_servicio) lines.push(`Servicio: ${datos.tipo_servicio}`);
  if (datos.detalle) lines.push(`Detalle: ${String(datos.detalle).slice(0, 500)}`);
  if (datos.urgencia) lines.push(`Urgente: ${datos.urgencia === "si" ? "sí" : "no"}`);
  if (slotLabel) lines.push(`Horario solicitado: ${slotLabel} (hora CDMX)`);
  if (extra) lines.push(extra);
  return lines.join("\n");
}
