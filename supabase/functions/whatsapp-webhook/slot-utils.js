/**
 * Pure helpers for WhatsApp cita scheduling (America/Mexico_City).
 * CDMX has no DST since 2022 → fixed UTC-6.
 */

export const CDMX_OFFSET = "-06:00";
export const TZ = "America/Mexico_City";

/** @param {string} fecha YYYY-MM-DD @param {string} hora HH:MM or HH:MM:SS */
export function cdmxLocalToIso(fecha, hora) {
  const time = hora.length === 5 ? `${hora}:00` : hora.slice(0, 8);
  return new Date(`${fecha}T${time}${CDMX_OFFSET}`).toISOString();
}

/** @param {Date|string|number} date */
export function cdmxParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  // en-CA weekday: Mon, Tue, … — map to Postgres DOW (0=Sun … 6=Sat)
  const dowMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    fecha: `${parts.year}-${parts.month}-${parts.day}`,
    hora: `${parts.hour}:${parts.minute}:${parts.second}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dow: dowMap[parts.weekday] ?? 0,
  };
}

/** @param {string} iso */
export function formatSlotLabel(iso) {
  const d = new Date(iso);
  const label = d.toLocaleString("es-MX", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // WhatsApp button title max 20 chars
  return label.replace(/\./g, "").replace(/\s+/g, " ").trim().slice(0, 20);
}

/**
 * @param {string} aStartIso
 * @param {number} aDurMin
 * @param {string} bStartIso
 * @param {number} bDurMin
 */
export function rangesOverlap(aStartIso, aDurMin, bStartIso, bDurMin) {
  const a0 = new Date(aStartIso).getTime();
  const a1 = a0 + aDurMin * 60_000;
  const b0 = new Date(bStartIso).getTime();
  const b1 = b0 + bDurMin * 60_000;
  return a0 < b1 && b0 < a1; // [) half-open like cita_rango
}

/**
 * @param {{ dia_semana: number, hora_inicio: string, hora_fin: string, duracion_slot_min: number }[]} disponibilidad
 * @param {{ fecha_hora: string, duracion_min: number }[]} ocupadas  // non-cancelada
 * @param {{ now?: Date, count?: number, daysAhead?: number }} [opts]
 * @returns {{ iso: string, duracion_min: number, label: string }[]}
 */
export function proposeAvailableSlots(disponibilidad, ocupadas, opts = {}) {
  const now = opts.now ?? new Date();
  const count = opts.count ?? 3;
  const daysAhead = opts.daysAhead ?? 14;
  const byDow = new Map();
  for (const row of disponibilidad) {
    if (row.activo === false) continue;
    byDow.set(Number(row.dia_semana), row);
  }

  const slots = [];
  const nowParts = cdmxParts(now);

  for (let dayOffset = 0; dayOffset < daysAhead && slots.length < count; dayOffset++) {
    // Advance calendar day in CDMX by reconstructing local midnight + offset
    const base = cdmxLocalToIso(nowParts.fecha, "00:00:00");
    const dayDate = new Date(new Date(base).getTime() + dayOffset * 86_400_000);
    const day = cdmxParts(dayDate);
    const rule = byDow.get(day.dow);
    if (!rule) continue;

    const dur = Number(rule.duracion_slot_min) || 60;
    const inicio = String(rule.hora_inicio).slice(0, 5); // HH:MM
    const fin = String(rule.hora_fin).slice(0, 5);
    const [h0, m0] = inicio.split(":").map(Number);
    const [h1, m1] = fin.split(":").map(Number);
    const startMin = h0 * 60 + m0;
    const endMin = h1 * 60 + m1;

    for (let mins = startMin; mins + dur <= endMin; mins += dur) {
      const hh = String(Math.floor(mins / 60)).padStart(2, "0");
      const mm = String(mins % 60).padStart(2, "0");
      const iso = cdmxLocalToIso(day.fecha, `${hh}:${mm}:00`);
      if (new Date(iso).getTime() <= now.getTime()) continue;

      const conflict = ocupadas.some((c) =>
        rangesOverlap(iso, dur, c.fecha_hora, Number(c.duracion_min) || 60),
      );
      if (conflict) continue;

      slots.push({ iso, duracion_min: dur, label: formatSlotLabel(iso) });
      if (slots.length >= count) break;
    }
  }

  return slots;
}

/** Normalize incoming WA text for intent matching */
export function normalizeIntent(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

/**
 * @param {string} text
 * @param {string} [buttonId]
 * @returns {"agendar"|"solo_cotizacion"|"none"}
 */
export function parseCitaChoice(text, buttonId = "") {
  const id = String(buttonId ?? "").toLowerCase();
  if (id === "agendar_visita" || id === "agendar" || id === "cita") return "agendar";
  if (id === "solo_cotizacion" || id === "solo" || id === "asesor") return "solo_cotizacion";

  const t = normalizeIntent(text);
  if (!t) return "none";

  if (/^(1|uno)$/.test(t) || /\b(solo|cotizacion|asesor|contacta|no\s*gracias|despues)\b/.test(t)) {
    return "solo_cotizacion";
  }
  if (
    /^(2|dos)$/.test(t) ||
    /\b(cita|agendar|agenda|visita|horario|appoint)\b/.test(t)
  ) {
    return "agendar";
  }
  return "none";
}

/** True if message is a mid-flow jump request to scheduling */
export function wantsAgendarKeyword(text, buttonId = "") {
  return parseCitaChoice(text, buttonId) === "agendar";
}

/**
 * Resolve slot pick from 1/2/3, button id slot_N, or fuzzy datetime against proposed.
 * @param {string} text
 * @param {string} buttonId
 * @param {{ iso: string, label?: string }[]} proposed
 * @returns {number} index or -1
 */
export function parseSlotSelection(text, buttonId, proposed) {
  const id = String(buttonId ?? "");
  const mId = /^slot_(\d+)$/i.exec(id);
  if (mId) {
    const idx = Number(mId[1]) - 1;
    if (idx >= 0 && idx < proposed.length) return idx;
  }

  const t = normalizeIntent(text);
  if (/^[123]$/.test(t)) {
    const idx = Number(t) - 1;
    if (idx < proposed.length) return idx;
  }

  // Match against label fragments or ISO local pieces
  for (let i = 0; i < proposed.length; i++) {
    const label = normalizeIntent(proposed[i].label ?? formatSlotLabel(proposed[i].iso));
    if (t && (t === label || label.includes(t) || t.includes(label))) return i;
  }

  // HH:MM match unique among proposed
  const timeMatch = t.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (timeMatch) {
    const want = `${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}`;
    const hits = proposed
      .map((s, i) => ({ i, parts: cdmxParts(s.iso) }))
      .filter(({ parts }) => parts.hora.slice(0, 5) === want);
    if (hits.length === 1) return hits[0].i;
  }

  return -1;
}
