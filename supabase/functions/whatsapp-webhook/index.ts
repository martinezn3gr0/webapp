import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { runQuoteBotFlow } from "../_shared/quote-bot.js";

async function verifySignature(rawBody: string, sigHeader: string, appSecret: string): Promise<boolean> {
  if (!appSecret) return false;
  if (!sigHeader.startsWith("sha256=")) return false;
  const expected = sigHeader.slice(7);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  const VERIFY_TOKEN = Deno.env.get("META_VERIFY_TOKEN") ?? "";
  const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") ?? "";
  const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
    const valid = await verifySignature(rawBody, sigHeader, APP_SECRET);
    if (!valid) return new Response("Forbidden", { status: 403 });

    try {
      const payload = JSON.parse(rawBody);
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return new Response(JSON.stringify({ ok: true }), { status: 200 });

      const phoneNumber = normalizarTelefono(message.from);
      const contactName = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
      const buttonId =
        message.interactive?.button_reply?.id ??
        message.button?.payload ??
        "";
      const incomingText =
        message.text?.body ??
        message.button?.text ??
        message.interactive?.button_reply?.title ??
        "";

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
          .insert({ phone_number: phoneNumber, nombre: contactName ?? null, estado_bot: "en_proceso" })
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

      async function sendWA(to: string, body: string) {
        const res = await fetch(GRAPH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
        });
        if (!res.ok) console.error("Error WA text:", await res.text());
      }

      /** Interactive reply buttons (max 3). Falls back to plain text listing options. */
      async function sendWAButtons(
        to: string,
        bodyText: string,
        buttons: { id: string; title: string }[],
      ) {
        const payloadBody = {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
              buttons: buttons.slice(0, 3).map((b) => ({
                type: "reply",
                reply: { id: b.id, title: b.title.slice(0, 20) },
              })),
            },
          },
        };
        const res = await fetch(GRAPH_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify(payloadBody),
        });
        if (!res.ok) {
          console.error("Error WA buttons:", await res.text());
          const fallback =
            bodyText +
            "\n\n" +
            buttons.map((b, i) => `${i + 1}) ${b.title}`).join("\n");
          await sendWA(to, fallback);
          return fallback;
        }
        return bodyText;
      }

      async function logBot(cid: string, texto: string) {
        await supabase.from("mensajes").insert({ contacto_id: cid, sender: "bot", contenido: texto });
      }

      async function reply(texto: string) {
        await sendWA(phoneNumber, texto);
        await logBot(contacto.id, texto);
      }

      async function replyChoices(texto: string, buttons: { id: string; title: string }[]) {
        const logged = await sendWAButtons(phoneNumber, texto, buttons);
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

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
