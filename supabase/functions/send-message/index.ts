import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const WHATSAPP_TOKEN  = Deno.env.get("WHATSAPP_TOKEN") ?? "";
const PHONE_NUMBER_ID = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY        = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ALLOWED_ORIGIN  = Deno.env.get("PANEL_ORIGIN") ?? "https://instelecjg.vercel.app";

const GRAPH_URL = `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`;

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
    const { contacto_id, contenido } = await req.json();
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
