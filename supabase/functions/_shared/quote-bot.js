/**
 * Shared quote + pending-appointment bot flow used by Meta and Twilio WhatsApp webhooks.
 *
 * Adapters must provide `reply(text)` and `replyChoices(text, buttons)`.
 * Twilio Sandbox should implement replyChoices as numbered plain text.
 */
import {
  formatSlotLabel,
  parseCitaChoice,
  parseSlotSelection,
  proposeAvailableSlots,
  wantsAgendarKeyword,
} from "./slot-utils.js";

export const QUESTIONS = [
  { key: "nombre", text: "¡Hola! 👋 Para prepararte una cotización, ¿cuál es tu nombre?" },
  { key: "tipo_servicio", text: "Gracias. ¿Qué tipo de servicio necesitas?" },
  { key: "detalle", text: "Perfecto. Cuéntame brevemente el detalle de lo que necesitas." },
];

export const FASE_OFERTA = "ofreciendo_cita";
export const FASE_SLOT = "eligiendo_slot";

/** @param {unknown} raw */
export function asDatos(raw) {
  return (raw && typeof raw === "object" ? { ...raw } : {});
}

/** @param {Record<string, unknown>} datos @param {string} key */
export function strField(datos, key) {
  const v = datos[key];
  return typeof v === "string" ? v.trim() : "";
}

/**
 * @param {object} opts
 * @param {import("@supabase/supabase-js").SupabaseClient} opts.supabase
 * @param {object} opts.contacto — row from contactos
 * @param {boolean} opts.isNew
 * @param {string} opts.incomingText
 * @param {string} [opts.buttonId]
 * @param {(texto: string) => Promise<void>} opts.reply
 * @param {(texto: string, buttons: { id: string, title: string }[]) => Promise<void>} opts.replyChoices
 */
export async function runQuoteBotFlow({
  supabase,
  contacto,
  isNew,
  incomingText,
  buttonId = "",
  reply,
  replyChoices,
}) {
  if (contacto.estado_bot === "humano") {
    return { handled: true, reason: "humano" };
  }

  async function handoffHumano(mensajeCierre) {
    if (mensajeCierre) await reply(mensajeCierre);
    await supabase.from("contactos").update({ estado_bot: "humano" }).eq("id", contacto.id);
  }

  async function saveDatos(cotizacionId, datos, paso) {
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

  async function ofrecerCita(cotizacion, datos, paso) {
    datos.__fase = FASE_OFERTA;
    delete datos.__slots;
    await saveDatos(cotizacion.id, datos, paso);
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
    await replyChoices(texto, [
      { id: "solo_cotizacion", title: "Solo cotización" },
      { id: "agendar_visita", title: "Agendar visita" },
    ]);
  }

  async function proponerSlots(cotizacion, datos, paso) {
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
    await replyChoices(texto, buttons);
  }

  async function crearCitaPendiente(cotizacion, datos, slot) {
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
      await reply("Ese horario acaba de ocuparse. Te propongo otras opciones.");
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

  if (isNew) {
    const saludo = QUESTIONS[0].text;
    await reply(saludo);
    await supabase.from("cotizaciones").insert({
      contacto_id: contacto.id,
      datos: {},
      estatus: "pendiente",
      paso_flujo: 1,
    });
    return { handled: true, reason: "new_contact" };
  }

  let { data: cotizacion } = await supabase
    .from("cotizaciones")
    .select("*")
    .eq("contacto_id", contacto.id)
    .eq("estatus", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!cotizacion) {
    const { data: reciente } = await supabase
      .from("cotizaciones")
      .select("*")
      .eq("contacto_id", contacto.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const fase = reciente ? String(asDatos(reciente.datos).__fase ?? "") : "";
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
  let paso = cotizacion.paso_flujo ?? 0;
  const fase = String(datos.__fase ?? "");

  if (fase === FASE_SLOT) {
    const proposed = Array.isArray(datos.__slots) ? datos.__slots : [];
    const idx = parseSlotSelection(incomingText, buttonId, proposed);
    if (idx < 0 || !proposed[idx]) {
      await reply("No reconocí el horario. Responde con 1, 2 o 3 según las opciones que te envié.");
      return { handled: true, reason: "slot_invalid" };
    }
    await crearCitaPendiente(cotizacion, datos, proposed[idx]);
    return { handled: true, reason: "slot_booked" };
  }

  if (fase === FASE_OFERTA) {
    const choice = parseCitaChoice(incomingText, buttonId);
    if (choice === "agendar") {
      await proponerSlots(cotizacion, datos, Math.max(paso, QUESTIONS.length));
      return { handled: true, reason: "oferta_agendar" };
    }
    if (choice === "solo_cotizacion") {
      delete datos.__fase;
      delete datos.__slots;
      await saveDatos(cotizacion.id, datos, Math.max(paso, QUESTIONS.length));
      await handoffHumano("¡Perfecto! Un asesor te contactará en breve con tu cotización. 🙌");
      return { handled: true, reason: "oferta_solo" };
    }
    await replyChoices(
      "¿Deseas agendar una visita técnica o solo la cotización?\n1) Solo cotización\n2) Agendar visita",
      [
        { id: "solo_cotizacion", title: "Solo cotización" },
        { id: "agendar_visita", title: "Agendar visita" },
      ],
    );
    return { handled: true, reason: "oferta_clarify" };
  }

  if (wantsAgendarKeyword(incomingText, buttonId)) {
    const nombre =
      strField(datos, "nombre") ||
      (typeof contacto.nombre === "string" ? contacto.nombre.trim() : "");
    if (!nombre) {
      datos.__pendiente_agendar = true;
      await reply("Antes de agendar, ¿cuál es tu nombre?");
      await saveDatos(cotizacion.id, datos, 1);
      return { handled: true, reason: "agendar_ask_nombre" };
    }
    if (!strField(datos, "nombre")) {
      datos.nombre = nombre;
    }
    delete datos.__pendiente_agendar;
    if (contacto.nombre !== nombre) {
      await supabase.from("contactos").update({ nombre }).eq("id", contacto.id);
    }
    await proponerSlots(cotizacion, datos, Math.max(paso, 1));
    return { handled: true, reason: "agendar_keyword" };
  }

  if (datos.__pendiente_agendar && incomingText) {
    datos.nombre = incomingText.trim();
    delete datos.__pendiente_agendar;
    await supabase.from("contactos").update({ nombre: datos.nombre }).eq("id", contacto.id);
    await saveDatos(cotizacion.id, datos, Math.max(paso, 1));
    await proponerSlots(cotizacion, datos, Math.max(paso, 1));
    return { handled: true, reason: "agendar_after_nombre" };
  }

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
    await ofrecerCita(cotizacion, datos, nuevosPaso);
  }

  return { handled: true, reason: pendingQuestion ? "ask_question" : "oferta_cita" };
}
