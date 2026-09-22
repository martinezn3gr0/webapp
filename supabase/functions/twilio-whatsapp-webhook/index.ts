/**
 * Twilio WhatsApp Sandbox webhook for InstalecJG.
 *
 * Receives Messaging webhooks (POST application/x-www-form-urlencoded),
 * validates X-Twilio-Signature, runs the same quote + pending-cita flow as
 * the Meta whatsapp-webhook, and replies via Twilio REST Messages API.
 *
 * Setup: see README.md in this folder.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runQuoteBotFlow } from "../_shared/quote-bot.js";
import {
  extractTwilioInbound,
  formatNumberedChoices,
  parseFormBody,
  verifyTwilioSignature,
} from "../_shared/twilio-utils.js";

/** Public URL Twilio must POST to (must match signature base URL exactly). */
const DEFAULT_WEBHOOK_URL =
  "https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/twilio-whatsapp-webhook";

Deno.serve(async (req: Request) => {
  const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "whatsapp:+14155238886";
  const TWILIO_WEBHOOK_URL = Deno.env.get("TWILIO_WEBHOOK_URL") ?? DEFAULT_WEBHOOK_URL;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (req.method === "GET") {
    return new Response(
      JSON.stringify({
        ok: true,
        service: "twilio-whatsapp-webhook",
        hint: "Configure Twilio Sandbox «When a message comes in» as HTTP POST to this URL.",
        webhook_url: TWILIO_WEBHOOK_URL,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const params = parseFormBody(rawBody);
  const sigHeader = req.headers.get("x-twilio-signature") ?? "";

  const valid = await verifyTwilioSignature(
    TWILIO_AUTH_TOKEN,
    TWILIO_WEBHOOK_URL,
    params,
    sigHeader,
  );
  if (!valid) {
    console.error("Invalid Twilio signature");
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { phoneNumber, incomingText, buttonId, profileName } = extractTwilioInbound(params);

    if (!phoneNumber) {
      return emptyTwilioOk();
    }

    let { data: contacto } = await supabase
      .from("contactos")
      .select("*")
      .eq("phone_number", phoneNumber)
      .maybeSingle();

    let isNew = false;
    if (!contacto) {
      isNew = true;
      const { data: nuevoContacto, error } = await supabase
        .from("contactos")
        .insert({
          phone_number: phoneNumber,
          nombre: profileName || null,
          estado_bot: "en_proceso",
        })
        .select()
        .single();
      if (error) throw error;
      contacto = nuevoContacto;
    }

    await supabase.from("mensajes").insert({
      contacto_id: contacto.id,
      sender: "cliente",
      contenido: incomingText || (buttonId ? `[botón:${buttonId}]` : ""),
    });

    async function sendTwilio(toDigits: string, body: string) {
      if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
        console.error("Missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN");
        return;
      }
      const to = toDigits.startsWith("whatsapp:") ? toDigits : `whatsapp:+${toDigits}`;
      const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
      const form = new URLSearchParams();
      form.set("From", TWILIO_WHATSAPP_FROM);
      form.set("To", to);
      form.set("Body", body);

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
        {
          method: "POST",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: form.toString(),
        },
      );
      if (!res.ok) {
        console.error("Error Twilio send:", await res.text());
      }
    }

    async function logBot(cid: string, texto: string) {
      await supabase.from("mensajes").insert({ contacto_id: cid, sender: "bot", contenido: texto });
    }

    async function reply(texto: string) {
      await sendTwilio(phoneNumber, texto);
      await logBot(contacto.id, texto);
    }

    /** Sandbox: numbered plain text (no Meta-style interactive buttons). */
    async function replyChoices(texto: string, buttons: { id: string; title: string }[]) {
      const logged = formatNumberedChoices(texto, buttons);
      await sendTwilio(phoneNumber, logged);
      await logBot(contacto.id, logged);
    }

    await runQuoteBotFlow({
      supabase,
      contacto,
      isNew,
      incomingText,
      buttonId,
      reply,
      replyChoices,
    });

    // Empty 200 — we already replied via REST (avoids duplicate TwiML replies).
    return emptyTwilioOk();
  } catch (err) {
    console.error("Twilio webhook error:", err);
    // Still 200 so Twilio does not retry aggressively on app errors.
    return emptyTwilioOk();
  }
});

function emptyTwilioOk() {
  return new Response("<Response></Response>", {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
