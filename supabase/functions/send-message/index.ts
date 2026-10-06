import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendTelegramDocument, sendTelegramMessage, telegramChatIdFromContact } from "../_shared/telegram-utils.js";
import {
  QUOTE_PDF_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  captionTelegram,
  estatusTrasEnvio,
  textoConEnlace,
  textoRegistro,
  validarDocumentoCotizacion,
} from "../_shared/quote-send-utils.js";

const WHATSAPP_TOKEN  = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN  = Deno.env.get("PANEL_ORIGIN") ?? "https://instelecjg.vercel.app";

const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sendWhatsAppText(to: string, body: string) {
  return await fetch(GRAPH_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
}

/**
 * Envía el PDF de una cotización:
 *  - Telegram: el archivo directo (sendDocument); si falla, texto + enlace firmado.
 *  - WhatsApp: texto + enlace firmado (30 días). Meta exige plantillas/sesión para documentos.
 * Después marca la cotización como enviada (sent_at, pdf_path).
 */
// deno-lint-ignore no-explicit-any
async function enviarCotizacion({ adminClient, contacto, contacto_id, contenido, cotizacion_id, documento, tgChatId }: any) {
  const doc = validarDocumentoCotizacion(documento, cotizacion_id);
  if (!doc.ok) return json({ error: doc.error }, 400);

  const { data: cot, error: cotError } = await adminClient
    .from("cotizaciones")
    .select("id, contacto_id, estatus")
    .eq("id", cotizacion_id)
    .maybeSingle();
  if (cotError || !cot || cot.contacto_id !== contacto.id) {
    return json({ error: "La cotización no pertenece a este contacto" }, 404);
  }

  const storage = adminClient.storage.from(QUOTE_PDF_BUCKET);
  const { data: signed, error: signError } = await storage.createSignedUrl(doc.path, SIGNED_URL_TTL_SECONDS, {
    download: doc.filename,
  });
  if (signError || !signed?.signedUrl) {
    return json({ error: "No se encontró el PDF en Storage", detail: signError?.message ?? "" }, 404);
  }
  const signedUrl = signed.signedUrl as string;

  let canal = "whatsapp";
  let modo: "adjunto" | "enlace" = "enlace";

  if (tgChatId) {
    canal = "telegram";
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
    const { data: blob, error: dlError } = await storage.download(doc.path);
    let tgRes = null;
    if (!dlError && blob) {
      tgRes = await sendTelegramDocument(token, tgChatId, blob, doc.filename, captionTelegram(contenido));
    }
    if (tgRes?.ok) {
      modo = "adjunto";
    } else {
      const fallback = await sendTelegramMessage(token, tgChatId, textoConEnlace(contenido, signedUrl));
      if (!fallback?.ok) {
        return json({ error: "Error enviando por Telegram", detail: fallback?.description ?? tgRes?.description ?? "" }, 502);
      }
    }
  } else {
    const waRes = await sendWhatsAppText(contacto.phone_number, textoConEnlace(contenido, signedUrl));
    if (!waRes.ok) {
      const errText = await waRes.text();
      console.error("Error de WhatsApp:", errText);
      return json({ error: "Error enviando por WhatsApp", detail: errText }, 502);
    }
  }

  const sentAt = new Date().toISOString();
  await Promise.all([
    adminClient.from("mensajes").insert({
      contacto_id, sender: "agente", contenido: textoRegistro(contenido, { filename: doc.filename, modo, url: signedUrl }),
    }),
    adminClient.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto_id),
    adminClient.from("cotizaciones")
      .update({ estatus: estatusTrasEnvio(cot.estatus), sent_at: sentAt, pdf_path: doc.path })
      .eq("id", cot.id),
  ]);

  return json({ ok: true, canal, documento: modo, sent_at: sentAt, signed_url: signedUrl });
}

const corsHeaders = {
  "Access-Control-Allow-Origin":  ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    // 1. Verificar que el JWT pertenece a un agente registrado
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Sin autorización" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Crear cliente con el JWT del usuario para validar identidad
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verificar que el usuario es agente registrado
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: agente } = await adminClient
      .from("agentes")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!agente) {
      return new Response(JSON.stringify({ error: "No autorizado — no eres agente" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Obtener payload
    //    Opcional (cotización formal): cotizacion_id + documento { path, filename } con el PDF
    //    ya subido al bucket privado `cotizaciones-pdf`. Sin `documento` el flujo es idéntico al de siempre.
    const { contacto_id, contenido, cotizacion_id, documento } = await req.json();
    if (!contacto_id || !contenido) {
      return new Response(JSON.stringify({ error: "Faltan contacto_id o contenido" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Obtener contacto
    const { data: contacto, error: contactoError } = await adminClient
      .from("contactos")
      .select("id, phone_number")
      .eq("id", contacto_id)
      .single();

    if (contactoError || !contacto) {
      return new Response(JSON.stringify({ error: "Contacto no encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tgChatId = telegramChatIdFromContact(contacto.phone_number);

    // 4b. Envío de cotización formal con PDF
    if (documento) {
      return await enviarCotizacion({
        adminClient, contacto, contacto_id, contenido, cotizacion_id, documento, tgChatId,
      });
    }

    // 5a. Telegram contacts (phone_number = "tg:<chat_id>") → Telegram Bot API
    if (tgChatId) {
      const tgRes = await sendTelegramMessage(Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "", tgChatId, contenido);
      if (!tgRes?.ok) {
        return new Response(JSON.stringify({ error: "Error enviando por Telegram", detail: tgRes?.description ?? "" }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await Promise.all([
        adminClient.from("mensajes").insert({ contacto_id, sender: "agente", contenido }),
        adminClient.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto_id),
      ]);
      return new Response(JSON.stringify({ ok: true, canal: "telegram" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Enviar por WhatsApp Cloud API
    const waRes = await fetch(GRAPH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: contacto.phone_number,
        type: "text",
        text: { body: contenido },
      }),
    });

    if (!waRes.ok) {
      const errText = await waRes.text();
      console.error("Error de WhatsApp:", errText);
      return new Response(JSON.stringify({ error: "Error enviando por WhatsApp", detail: errText }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Registrar mensaje del agente y marcar conversación como humana
    await Promise.all([
      adminClient.from("mensajes").insert({ contacto_id, sender: "agente", contenido }),
      adminClient.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto_id),
    ]);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-message error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
