import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  formatSlotLabel,
  parseCitaChoice,
  parseSlotSelection,
  proposeAvailableSlots,
  wantsAgendarKeyword,
} from "./slot-utils.js";

const QUESTIONS = [
  { key: "nombre", text: "¡Hola! 👋 Para prepararte una cotización, ¿cuál es tu nombre?" },
  { key: "tipo_servicio", text: "Gracias. ¿Qué tipo de servicio necesitas?" },
  { key: "detalle", text: "Perfecto. Cuéntame brevemente el detalle de lo que necesitas." },
];

const FASE_OFERTA = "ofreciendo_cita";
const FASE_SLOT = "eligiendo_slot";

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

type Datos = Record<string, unknown>;

function asDatos(raw: unknown): Datos {
  return (raw && typeof raw === "object" ? { ...(raw as Datos) } : {}) as Datos;
}

function strField(datos: Datos, key: string): string {
  const v = datos[key];
  return typeof v === "string" ? v.trim() : "";
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

      // Jorge / agente tiene el hilo: el bot no responde.
      if (contacto.estado_bot === "humano") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

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

      async function replyButtons(texto: string, buttons: { id: string; title: string }[]) {
        const logged = await sendWAButtons(phoneNumber, texto, buttons);
        await logBot(contacto.id, logged);
      }

      async function handoffHumano(mensajeCierre?: string) {
        if (mensajeCierre) await reply(mensajeCierre);
        await supabase.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto.id);
      }

      async function saveDatos(cotizacionId: string, datos: Datos, paso: number) {
        delete datos["__started"];
        await supabase
          .from("cotizaciones")
          .update({ datos, paso_flujo: paso, updated_at: new Date().toISOString() })
          .eq("id", cotizacionId);
      }

      async function loadOcupadas() {
        const { data } = await supabase
          .from("citas")
          .select("fecha_hora, duracion_min")
          .in("estado", ["pendiente", "confirmada"]);
        return data ?? [];
      }

      async function loadDisponibilidad() {
        const { data } = await supabase
          .from("disponibilidad")
          .select("dia_semana, hora_inicio, hora_fin, duracion_slot_min, activo")
          .eq("activo", true);
        return data ?? [];
      }

      async function ofrecerCita(cotizacion: { id: string }, datos: Datos, paso: number) {
        datos.__fase = FASE_OFERTA;
        delete datos.__slots;
        await saveDatos(cotizacion.id, datos, paso);
        // Cotización lista para que Jorge ponga monto; no inventamos precios.
        await supabase
          .from("cotizaciones")
          .update({ estatus: "enviada", updated_at: new Date().toISOString() })
          .eq("id", cotizacion.id)
          .eq("estatus", "pendiente");

        const texto =
          "¡Gracias! Ya tengo tus datos para la cotización (sin precios todavía; un asesor te confirma el monto).\n\n" +
          "¿Deseas agendar una visita técnica?\n" +
          "1) Solo cotización — un asesor te contacta\n" +
          "2) Quiero agendar una visita";
        await replyButtons(texto, [
          { id: "solo_cotizacion", title: "Solo cotización" },
          { id: "agendar_visita", title: "Agendar visita" },
        ]);
      }

      async function proponerSlots(cotizacion: { id: string }, datos: Datos, paso: number) {
        const [disponibilidad, ocupadas] = await Promise.all([loadDisponibilidad(), loadOcupadas()]);
        const slots = proposeAvailableSlots(disponibilidad, ocupadas, { count: 3, daysAhead: 14 });

        if (slots.length === 0) {
          delete datos.__fase;
          delete datos.__slots;
          await saveDatos(cotizacion.id, datos, paso);
          await handoffHumano(
            "Por ahora no tengo horarios libres en el calendario. Un asesor te contactará para coordinar la visita. 🙌",
          );
          return;
        }

        datos.__fase = FASE_SLOT;
        datos.__slots = slots.map((s) => ({ iso: s.iso, duracion_min: s.duracion_min, label: s.label }));
        await saveDatos(cotizacion.id, datos, paso);

        const lineas = slots.map((s, i) => `${i + 1}) ${s.label}`).join("\n");
        const texto =
          "Estos son los próximos horarios disponibles (hora Ciudad de México).\n" +
          "Responde con 1, 2 o 3, o el horario que prefieras:\n\n" +
          lineas +
          "\n\nLa cita quedará pendiente hasta que un técnico la confirme.";

        const buttons = slots.map((s, i) => ({
          id: `slot_${i + 1}`,
          title: s.label.slice(0, 20),
        }));
        await replyButtons(texto, buttons);
      }

      async function crearCitaPendiente(
        cotizacion: { id: string },
        datos: Datos,
        slot: { iso: string; duracion_min: number; label?: string },
      ) {
        const { error } = await supabase.from("citas").insert({
          contacto_id: contacto.id,
          cotizacion_id: cotizacion.id,
          fecha_hora: slot.iso,
          duracion_min: slot.duracion_min || 60,
          estado: "pendiente",
          notas: "Solicitada por WhatsApp",
        });

        if (error) {
          console.error("Error insert cita:", error);
          // Posible carrera con EXCLUDE no_solapamiento_citas → re-proponer
          await reply(
            "Ese horario acaba de ocuparse. Te propongo otras opciones.",
          );
          await proponerSlots(cotizacion, datos, QUESTIONS.length);
          return false;
        }

        delete datos.__fase;
        delete datos.__slots;
        await saveDatos(cotizacion.id, datos, QUESTIONS.length);

        const cuando = slot.label || formatSlotLabel(slot.iso);
        await handoffHumano(
          `Listo. Registré tu solicitud de visita para *${cuando}* (hora CDMX) con estatus pendiente.\n\n` +
            "Un técnico la confirmará desde el panel; no está confirmada todavía. " +
            "Un asesor también te contactará sobre la cotización. 🙌",
        );
        return true;
      }

      // ——— Nuevo contacto: primera pregunta ———
      if (isNew) {
        const saludo = QUESTIONS[0].text;
        await reply(saludo);
        await supabase.from("cotizaciones").insert({
          contacto_id: contacto.id,
          datos: {},
          estatus: "pendiente",
          paso_flujo: 1,
        });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // ——— Contacto existente en_proceso ———
      let { data: cotizacion } = await supabase
        .from("cotizaciones")
        .select("*")
        .eq("contacto_id", contacto.id)
        .eq("estatus", "pendiente")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Si ya enviamos la cotización pero seguimos ofreciendo/eligiendo cita, reutilizar esa fila.
      if (!cotizacion) {
        const { data: reciente } = await supabase
          .from("cotizaciones")
          .select("*")
          .eq("contacto_id", contacto.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        const fase = reciente ? String((asDatos(reciente.datos).__fase as string) ?? "") : "";
        if (reciente && (fase === FASE_OFERTA || fase === FASE_SLOT)) {
          cotizacion = reciente;
        }
      }

      if (!cotizacion) {
        const { data: nueva, error } = await supabase
          .from("cotizaciones")
          .insert({ contacto_id: contacto.id, datos: {}, estatus: "pendiente", paso_flujo: 0 })
          .select()
          .single();
        if (error) throw error;
        cotizacion = nueva;
      }

      const datos = asDatos(cotizacion.datos);
      let paso = (cotizacion.paso_flujo as number) ?? 0;
      const fase = String(datos.__fase ?? "");

      // ——— Fase: eligiendo horario ———
      if (fase === FASE_SLOT) {
        const proposed = Array.isArray(datos.__slots) ? (datos.__slots as { iso: string; duracion_min: number; label?: string }[]) : [];
        const idx = parseSlotSelection(incomingText, buttonId, proposed);
        if (idx < 0 || !proposed[idx]) {
          await reply("No reconocí el horario. Responde con 1, 2 o 3 según las opciones que te envié.");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        await crearCitaPendiente(cotizacion, datos, proposed[idx]);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // ——— Fase: ofreciendo cita vs solo cotización ———
      if (fase === FASE_OFERTA) {
        const choice = parseCitaChoice(incomingText, buttonId);
        if (choice === "agendar") {
          await proponerSlots(cotizacion, datos, Math.max(paso, QUESTIONS.length));
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (choice === "solo_cotizacion") {
          delete datos.__fase;
          delete datos.__slots;
          await saveDatos(cotizacion.id, datos, Math.max(paso, QUESTIONS.length));
          await handoffHumano("¡Perfecto! Un asesor te contactará en breve con tu cotización. 🙌");
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        await replyButtons(
          "¿Deseas agendar una visita técnica o solo la cotización?\n1) Solo cotización\n2) Agendar visita",
          [
            { id: "solo_cotizacion", title: "Solo cotización" },
            { id: "agendar_visita", title: "Agendar visita" },
          ],
        );
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // ——— Salto anticipado a agenda (keywords) mientras en_proceso ———
      if (wantsAgendarKeyword(incomingText, buttonId)) {
        const nombre =
          strField(datos, "nombre") ||
          (typeof contacto.nombre === "string" ? contacto.nombre.trim() : "");
        if (!nombre) {
          // Pedir nombre antes de horarios; no guardar "cita" como nombre.
          datos.__pendiente_agendar = true;
          const ask = "Antes de agendar, ¿cuál es tu nombre?";
          await reply(ask);
          await saveDatos(cotizacion.id, datos, 1);
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (!strField(datos, "nombre")) {
          datos.nombre = nombre;
        }
        delete datos.__pendiente_agendar;
        if (contacto.nombre !== nombre) {
          await supabase.from("contactos").update({ nombre }).eq("id", contacto.id);
        }
        await proponerSlots(cotizacion, datos, Math.max(paso, 1));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // Tras pedir nombre por keyword "cita"/"agendar", continuar a horarios.
      if (datos.__pendiente_agendar && incomingText) {
        datos.nombre = incomingText.trim();
        delete datos.__pendiente_agendar;
        await supabase.from("contactos").update({ nombre: datos.nombre }).eq("id", contacto.id);
        await saveDatos(cotizacion.id, datos, Math.max(paso, 1));
        await proponerSlots(cotizacion, datos, Math.max(paso, 1));
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }

      // ——— Flujo de cotización (3 preguntas) ———
      if (paso > 0 && paso <= QUESTIONS.length && incomingText) {
        const prevKey = QUESTIONS[paso - 1].key;
        if (!strField(datos, prevKey)) datos[prevKey] = incomingText;
        if (prevKey === "nombre" && incomingText) {
          await supabase.from("contactos").update({ nombre: incomingText.trim() }).eq("id", contacto.id);
        }
      }
      delete datos["__started"];

      const nextIdx = QUESTIONS.findIndex((q) => !strField(datos, q.key));
      const pendingQuestion = nextIdx !== -1 ? QUESTIONS[nextIdx] : null;
      const nuevosPaso = pendingQuestion ? nextIdx + 1 : QUESTIONS.length;

      await saveDatos(cotizacion.id, datos, nuevosPaso);

      if (pendingQuestion) {
        await reply(pendingQuestion.text);
      } else {
        // Cotización completa → ofrecer cita (no inventar precios; no auto-confirmar).
        await ofrecerCita(cotizacion, datos, nuevosPaso);
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    } catch (err) {
      console.error("Webhook error:", err);
      return new Response(JSON.stringify({ ok: false }), { status: 200 });
    }
  }

  return new Response("Method Not Allowed", { status: 405 });
});
