/**
 * Twilio Messaging helpers: signature validation + WhatsApp From normalization.
 * Spec: https://www.twilio.com/docs/usage/security#validating-requests
 */

/** Strip whatsapp: prefix and keep digits only. */
export function normalizarTelefonoTwilio(raw) {
  return String(raw ?? "")
    .replace(/^whatsapp:/i, "")
    .replace(/\D/g, "");
}

/**
 * Build the string Twilio signs: full URL + sorted POST params concatenated as key+value.
 * @param {string} url — exact public webhook URL (no query string unless Twilio includes it)
 * @param {Record<string, string>} params — application/x-www-form-urlencoded fields
 */
export function buildTwilioSignaturePayload(url, params) {
  const keys = Object.keys(params).sort();
  let data = String(url);
  for (const key of keys) {
    data += key + String(params[key] ?? "");
  }
  return data;
}

/**
 * HMAC-SHA1 of the signature payload, Base64-encoded (Twilio's X-Twilio-Signature).
 * @param {string} authToken
 * @param {string} url
 * @param {Record<string, string>} params
 */
export async function computeTwilioSignature(authToken, url, params) {
  const payload = buildTwilioSignaturePayload(url, params);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  const bytes = new Uint8Array(mac);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/** Constant-time-ish string compare. */
export function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * @param {string} authToken
 * @param {string} url
 * @param {Record<string, string>} params
 * @param {string} signatureHeader — X-Twilio-Signature
 */
export async function verifyTwilioSignature(authToken, url, params, signatureHeader) {
  if (!authToken || !signatureHeader || !url) return false;
  const expected = await computeTwilioSignature(authToken, url, params);
  return timingSafeEqualStr(expected, signatureHeader);
}

/**
 * Parse application/x-www-form-urlencoded body into a flat string map.
 * @param {string} rawBody
 * @returns {Record<string, string>}
 */
export function parseFormBody(rawBody) {
  const out = {};
  const params = new URLSearchParams(rawBody);
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return out;
}

/**
 * Format interactive choices as numbered plain text (Twilio Sandbox-friendly).
 * If body already lists 1)/2), returns body unchanged.
 * @param {string} bodyText
 * @param {{ id: string, title: string }[]} buttons
 */
export function formatNumberedChoices(bodyText, buttons) {
  if (!buttons?.length) return bodyText;
  const alreadyNumbered = /\n\s*1\)/.test(bodyText) || /^\s*1\)/m.test(bodyText);
  if (alreadyNumbered) return bodyText;
  return (
    bodyText +
    "\n\n" +
    buttons.map((b, i) => `${i + 1}) ${b.title}`).join("\n")
  );
}

/**
 * Extract inbound message fields from Twilio Messaging webhook params.
 * @param {Record<string, string>} params
 */
export function extractTwilioInbound(params) {
  const from = params.From ?? "";
  const body = params.Body ?? "";
  // Quick-reply / button payloads when present (Content API / some WA templates)
  const buttonId =
    params.ButtonPayload ??
    params.ButtonText ??
    params.ListId ??
    "";
  return {
    phoneNumber: normalizarTelefonoTwilio(from),
    incomingText: body,
    buttonId: String(buttonId),
    profileName: params.ProfileName ?? "",
  };
}
