import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PANEL_ORIGIN = Deno.env.get("PANEL_ORIGIN") ?? "https://instelecjg.com";

const ALLOWED_ORIGINS = new Set([
  PANEL_ORIGIN,
  "https://instelecjg.com",
  "https://www.instelecjg.com",
  "https://instelecjg.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

function corsHeaders(origin: string | null) {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : PANEL_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function normalizarTelefono(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 10) digits = `52${digits}`;
  if (digits.startsWith("521") && digits.length === 13) {
    digits = `52${digits.slice(3)}`;
  }
  return digits;
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const nombre = cleanText(body.nombre, 120);
    const telefono = normalizarTelefono(cleanText(body.telefono, 40));
    const servicio = cleanText(body.servicio, 120);
    const urgencia = body.urgencia === "si" ? "si" : "no";
    const descripcion = cleanText(body.descripcion, 2000);
    const fuente = cleanText(body.fuente || "web_form", 40) || "web_form";

    if (!nombre || !telefono || telefono.length < 12 || !servicio) {
      return new Response(
        JSON.stringify({ error: "Faltan nombre, teléfono válido o servicio" }),
        { status: 400, headers: { ...headers, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let { data: contacto } = await admin
      .from("contactos")
      .select("*")
      .eq("phone_number", telefono)
      .maybeSingle();

    if (!contacto) {
      const { data: nuevo, error } = await admin
        .from("contactos")
        .insert({
          phone_number: telefono,
          nombre,
          estado_bot: "humano",
        })
        .select()
        .single();
      if (error) throw error;
      contacto = nuevo;
    } else {
      const { data: actualizado, error } = await admin
        .from("contactos")
        .update({
          nombre: nombre || contacto.nombre,
          estado_bot: "humano",
          updated_at: new Date().toISOString(),
        })
        .eq("id", contacto.id)
        .select()
        .single();
      if (error) throw error;
      contacto = actualizado;
    }

    const datos = {
      nombre,
      tipo_servicio: servicio,
      detalle: descripcion || "(sin detalle)",
      urgencia,
      fuente,
      telefono,
    };

    const { data: cotizacion, error: cotError } = await admin
      .from("cotizaciones")
      .insert({
        contacto_id: contacto.id,
        datos,
        estatus: "enviada",
        paso_flujo: 3,
      })
      .select()
      .single();
    if (cotError) throw cotError;

    const resumen = [
      `Lead web (${fuente})`,
      `Nombre: ${nombre}`,
      `Teléfono: ${telefono}`,
      `Servicio: ${servicio}`,
      `Urgente: ${urgencia === "si" ? "sí" : "no"}`,
      `Detalle: ${descripcion || "(sin detalle)"}`,
    ].join("\n");

    await admin.from("mensajes").insert([
      {
        contacto_id: contacto.id,
        sender: "cliente",
        contenido: resumen,
      },
      {
        contacto_id: contacto.id,
        sender: "bot",
        contenido:
          "Recibí tu solicitud. Un asesor de Instalaciones Eléctricas J-G te contactará pronto por WhatsApp o teléfono.",
      },
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        contacto_id: contacto.id,
        cotizacion_id: cotizacion.id,
      }),
      { status: 200, headers: { ...headers, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("submit-lead error:", err);
    return new Response(JSON.stringify({ error: "No se pudo guardar la solicitud" }), {
      status: 500,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }
});
