import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, runQuoteBotFlow } from "./quote-bot.js";

/**
 * Minimal in-memory Supabase stub for the tables the bot touches.
 */
function makeFakeSupabase({ contacto, cotizacion }) {
  const state = {
    contacto: { ...contacto },
    cotizaciones: cotizacion ? [{ ...cotizacion, datos: { ...(cotizacion.datos || {}) } }] : [],
    citas: [],
    mensajes: [],
    disponibilidad: [
      {
        dia_semana: 1,
        hora_inicio: "08:00:00",
        hora_fin: "20:00:00",
        duracion_slot_min: 60,
        activo: true,
      },
    ],
  };

  function from(table) {
    const chain = {
      _filters: {},
      _op: null,
      _payload: null,
      select() {
        return chain;
      },
      insert(row) {
        chain._op = "insert";
        chain._payload = Array.isArray(row) ? row[0] : row;
        return chain;
      },
      update(row) {
        chain._op = "update";
        chain._payload = row;
        return chain;
      },
      eq(col, val) {
        chain._filters[col] = val;
        return chain;
      },
      in(col, vals) {
        chain._filters[col] = vals;
        return chain;
      },
      order() {
        return chain;
      },
      limit() {
        return chain;
      },
      async maybeSingle() {
        if (table === "cotizaciones") {
          const rows = state.cotizaciones.filter((c) => {
            if (chain._filters.contacto_id && c.contacto_id !== chain._filters.contacto_id) return false;
            if (chain._filters.estatus && c.estatus !== chain._filters.estatus) return false;
            return true;
          });
          return { data: rows[0] ?? null, error: null };
        }
        return { data: null, error: null };
      },
      async single() {
        if (chain._op === "insert") {
          if (table === "cotizaciones") {
            const row = {
              id: `cot-${state.cotizaciones.length + 1}`,
              created_at: new Date().toISOString(),
              ...chain._payload,
            };
            state.cotizaciones.unshift(row);
            return { data: row, error: null };
          }
          if (table === "citas") {
            const row = { id: `cita-${state.citas.length + 1}`, ...chain._payload };
            state.citas.push(row);
            return { data: row, error: null };
          }
          if (table === "mensajes") {
            state.mensajes.push(chain._payload);
            return { data: chain._payload, error: null };
          }
        }
        return { data: null, error: null };
      },
      then(resolve) {
        // await supabase.from(...).insert(...) without .single()
        return Promise.resolve(
          (async () => {
            if (chain._op === "insert") {
              if (table === "cotizaciones") {
                const row = {
                  id: `cot-${state.cotizaciones.length + 1}`,
                  created_at: new Date().toISOString(),
                  ...chain._payload,
                };
                state.cotizaciones.unshift(row);
                return { data: row, error: null };
              }
              if (table === "citas") {
                const row = { id: `cita-${state.citas.length + 1}`, ...chain._payload };
                state.citas.push(row);
                return { data: [row], error: null };
              }
              if (table === "mensajes") {
                state.mensajes.push(chain._payload);
                return { data: chain._payload, error: null };
              }
            }
            if (chain._op === "update") {
              if (table === "contactos") {
                Object.assign(state.contacto, chain._payload);
                return { data: state.contacto, error: null };
              }
              if (table === "cotizaciones") {
                const id = chain._filters.id;
                const row = state.cotizaciones.find((c) => c.id === id) || state.cotizaciones[0];
                if (row) {
                  if (chain._payload.datos) row.datos = { ...chain._payload.datos };
                  if (chain._payload.paso_flujo != null) row.paso_flujo = chain._payload.paso_flujo;
                  if (chain._payload.estatus) row.estatus = chain._payload.estatus;
                  if (chain._payload.updated_at) row.updated_at = chain._payload.updated_at;
                }
                return { data: row, error: null };
              }
            }
            if (table === "disponibilidad") {
              return { data: state.disponibilidad, error: null };
            }
            if (table === "citas" && chain._op !== "insert") {
              return { data: state.citas, error: null };
            }
            return { data: null, error: null };
          })(),
        ).then(resolve);
      },
    };
    return chain;
  }

  return { from, state };
}

describe("runQuoteBotFlow (shared)", () => {
  it("asks first question for a new contact", async () => {
    const replies = [];
    const { from, state } = makeFakeSupabase({
      contacto: { id: "c1", phone_number: "52155", nombre: null, estado_bot: "en_proceso" },
    });
    const result = await runQuoteBotFlow({
      supabase: { from },
      contacto: state.contacto,
      isNew: true,
      incomingText: "hola",
      buttonId: "",
      reply: async (t) => {
        replies.push(t);
      },
      replyChoices: async (t) => {
        replies.push(t);
      },
    });
    assert.equal(result.reason, "new_contact");
    assert.equal(replies[0], QUESTIONS[0].text);
    assert.equal(state.cotizaciones.length, 1);
    assert.equal(state.cotizaciones[0].paso_flujo, 1);
  });

  it("after three answers offers solo cotización vs agendar (numbered)", async () => {
    const replies = [];
    const { from, state } = makeFakeSupabase({
      contacto: { id: "c1", phone_number: "52155", nombre: "Ana", estado_bot: "en_proceso" },
      cotizacion: {
        id: "cot-1",
        contacto_id: "c1",
        estatus: "pendiente",
        paso_flujo: 3,
        datos: { nombre: "Ana", tipo_servicio: "contacto", detalle: undefined },
      },
    });
    // Fill detalle via this message (paso 3 means last answer is detalle)
    state.cotizaciones[0].datos = { nombre: "Ana", tipo_servicio: "contacto" };
    state.cotizaciones[0].paso_flujo = 3;

    await runQuoteBotFlow({
      supabase: { from },
      contacto: state.contacto,
      isNew: false,
      incomingText: "Necesito revisar un tablero",
      buttonId: "",
      reply: async (t) => {
        replies.push(t);
      },
      replyChoices: async (t) => {
        replies.push(t);
      },
    });

    const last = replies.at(-1) ?? "";
    assert.match(last, /agendar una visita/i);
    assert.match(last, /1\) Solo cotización/);
    assert.match(last, /2\) Quiero agendar/);
    assert.equal(state.cotizaciones[0].datos.__fase, "ofreciendo_cita");
    assert.equal(state.cotizaciones[0].estatus, "enviada");
  });

  it("skips replies when estado_bot is humano", async () => {
    const replies = [];
    const { from, state } = makeFakeSupabase({
      contacto: { id: "c1", phone_number: "52155", nombre: "Ana", estado_bot: "humano" },
    });
    const result = await runQuoteBotFlow({
      supabase: { from },
      contacto: state.contacto,
      isNew: false,
      incomingText: "hola",
      reply: async (t) => {
        replies.push(t);
      },
      replyChoices: async (t) => {
        replies.push(t);
      },
    });
    assert.equal(result.reason, "humano");
    assert.equal(replies.length, 0);
  });
});
