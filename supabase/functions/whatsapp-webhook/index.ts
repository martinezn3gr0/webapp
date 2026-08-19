import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const QUESTIONS = [
  { key: "nombre",        text: "¡Hola! 👋 Para prepararte una cotización, ¿cuál es tu nombre?" },
  { key: "tipo_servicio", text: "Gracias. ¿Qué tipo de servicio necesitas?" },
  { key: "detalle",       text: "Perfecto. Cuéntame brevemente el detalle de lo que necesitas." },
];

async function verifySignature(rawBody: string, sigHeader: string, appSecret: string): Promise<boolean> {
  if (!appSecret) return false;
  if (!sigHeader.startsWith("sha256=")) return false;
  const expected = sigHeader.slice(7);
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const computed = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
  if (computed.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) diff |= computed.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function normalizarTelefono(raw: string): string {
  return raw.replace(/\D/g, "");
}

Deno.serve(async (req: Request) => {
  const VERIFY_TOKEN     = Deno.env.get("META_VERIFY_TOKEN") ?? "";
  const WHATSAPP_TOKEN   = Deno.env.get("WHATSAPP_TOKEN") ?? "";
  const PHONE_NUMBER_ID  = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const APP_SECRET       = Deno.env.get("META_APP_SECRET") ?? "";
  const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabase  = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode      = url.searchParams.get("hub.mode");
    const token     = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const rawBody   = await req.text();
    const sigHeader = req.headers.get("x-hub-signature-256") ?? "";
    const valid     = await verifySignature(rawBody, sigHeader, APP_SECRET);
    if (!valid) return new Response("Forbidden", { status: 403 });

    try {
      const payload = JSON.parse(rawBody);
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!message) return new Response(JSON.stringify({ ok: true }), { status: 200 });

      const phoneNumber  = normalizarTelefono(message.from);
      const contactName  = payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
      const incomingText = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title ?? "";

      let { data: contacto } = await supabase.from("contactos").select("*").eq("phone_number", phoneNumber).maybeSingle();
      let isNew = false;
      if (!contacto) {
        isNew = true;
        const { data: nuevoContacto, error } = await supabase
          .from("contactos")
          .insert({ phone_number: phoneNumber, nombre: contactName ?? null, estado_bot: "en_proceso" })
          .select().single();
        if (error) throw error;
        contacto = nuevoContacto;
      }

      await supabase.from("mensajes").insert({ contacto_id: contacto.id, sender: "cliente", contenido: incomingText });
      if (contacto.estado_bot === "humano") return new Response(JSON.stringify({ ok: true }), { status: 200 });

      async function sendWA(to: string, body: string) {
        const res = await fetch(GRAPH_URL, {
          method: "POST",
          headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
        });
        if (!res.ok) console.error("Error WA:", await res.text());
      }

      async function logBot(cid: string, texto: string) {
        await supabase.from("mensajes").insert({ contacto_id: cid, sender: "bot", contenido: texto });
      }

      if (isNew) {
        const saludo = QUESTIONS[0].text;
        await sendWA(phoneNumber, saludo);
        await logBot(contacto.id, saludo);
        await supabase.from("cotizaciones").insert({ contacto_id: contacto.id, datos: {}, estatus: "pendiente", paso_flujo: 1 });
      } else {
        let { data: cotizacion } = await supabase
          .from("cotizaciones").select("*")
          .eq("contacto_id", contacto.id).eq("estatus", "pendiente")
          .order("created_at", { ascending: false }).limit(1).maybeSingle();

        if (!cotizacion) {
          const { data: nueva } = await supabase
            .from("cotizaciones")
            .insert({ contacto_id: contacto.id, datos: {}, estatus: "pendiente", paso_flujo: 0 })
            .select().single();
          cotizacion = nueva;
        }

        const datos = (cotizacion.datos as Record<string, string>) ?? {};
        const paso  = (cotizacion.paso_flujo as number) ?? 0;

        if (paso > 0 && paso <= QUESTIONS.length && incomingText) {
          const prevKey = QUESTIONS[paso - 1].key;
          if (!datos[prevKey]) datos[prevKey] = incomingText;
        }
        delete datos["__started"];

        const nextIdx         = QUESTIONS.findIndex(q => !datos[q.key]);
        const pendingQuestion = nextIdx !== -1 ? QUESTIONS[nextIdx] : null;
        const nuevosPaso      = pendingQuestion ? nextIdx + 1 : QUESTIONS.length;

        await supabase.from("cotizaciones").update({ datos, paso_flujo: nuevosPaso }).eq("id", cotizacion.id);

        if (pendingQuestion) {
          await sendWA(contacto.phone_number as string, pendingQuestion.text);
          await logBot(contacto.id, pendingQuestion.text);
        } else {
          const cierre = "¡Gracias! Ya tengo todos los datos. Un asesor te contactará en breve. 🙌";
          await sendWA(contacto.phone_number as string, cierre);
          await logBot(contacto.id, cierre);
          await supabase.from("cotizaciones").update({ estatus: "enviada" }).eq("id", cotizacion.id);
          await supabase.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto.id);
        }
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
