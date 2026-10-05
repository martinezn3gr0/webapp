/**
 * Telegram webhook for InstalecJG (@Instelecjgbot).
 *
 * - Validates X-Telegram-Bot-Api-Secret-Token against TELEGRAM_WEBHOOK_SECRET.
 * - Maps each private chat to a `contactos` row with phone_number = "tg:<chat_id>".
 * - Runs the shared quote bot flow (same as WhatsApp) plus a phone question
 *   (typed or shared via Telegram's request_contact button).
 * - Pending citas only; never confirms or quotes prices.
 * - `/soyjorge <TELEGRAM_OWNER_CODE>` registers the owner chat for notifications
 *   (stored in public.app_settings, key telegram_owner_chat_id).
 *
 * Setup: see README.md in this folder.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { QUESTIONS, runQuoteBotFlow } from "../_shared/quote-bot.js";
import { formatSlotLabel } from "../_shared/slot-utils.js";
import {
  OWNER_SETTING_KEY,
  REMOVE_KEYBOARD,
  choiceKeyboard,
  contactKeyboard,
  extractTelegramInbound,
  formatOwnerNotification,
  normalizeKeyboardText,
  normalizePhone,
  notifyOwner,
  parseCommand,
  safeEqual,
  sendTelegramMessage,
  telegramContactId,
} from "../_shared/telegram-utils.js";

const CANAL = "Telegram";
const BOT_USERNAME = "Instelecjgbot";

const TELEFONO_QUESTION = {
  key: "telefono",
  text:
    "¿A qué número te podemos llamar o escribir por WhatsApp? " +
    "Toca «📱 Compartir mi número» o escríbelo (10 dígitos).",
  invalidText:
    "No reconocí el número. Escríbelo a 10 dígitos (ej. 5512345678) o toca «📱 Compartir mi número».",
  validate: (t: string) => normalizePhone(t),
};

const TELEGRAM_QUESTIONS = [...QUESTIONS, TELEFONO_QUESTION];

const AYUDA =
  "Soy el asistente de *Instalaciones Eléctricas JG* (CDMX y Edomex) ⚡\n\n" +
  "Te ayudo a pedir una cotización gratis en línea y, si quieres, a solicitar una visita técnica " +
  "(lunes a sábado, 8:00 a 20:00). La visita a domicilio tiene costo; se descuenta del total si contratas. " +
  "Un técnico confirma la cita y el monto.\n\n" +
  "Comandos:\n/cotizar — iniciar o continuar una cotización\n/ayuda — ver esta ayuda";

Deno.serve(async (req: Request) => {
  if (req.method === "GET") {
    return json({ ok: true, service: "telegram-webhook" });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const expected = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
  const got = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!expected || !safeEqual(got, expected)) {
    console.error("telegram-webhook: invalid secret token");
    return new Response("Forbidden", { status: 403 });
  }

  let update: unknown;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true, ignored: "bad_json" });
  }

  // Answer Telegram fast; finish the work in the background when supported.
  const work = handleUpdate(update).catch((err) => console.error("telegram-webhook error:", err));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) {
    runtime.waitUntil(work);
  } else {
    await work;
  }
  return json({ ok: true });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleUpdate(update: unknown) {
  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
  const OWNER_CODE = Deno.env.get("TELEGRAM_OWNER_CODE") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  const inbound = extractTelegramInbound(update);
  if (!inbound || inbound.isBot) return;
  const chatId = inbound.chatId;
  const send = (text: string, markup?: unknown) => sendTelegramMessage(TOKEN, chatId, text, markup);
  const cmd = parseCommand(inbound.text);

  // Groups / supergroups / channels: never run the quote flow or touch the DB.
  // Only answer /cotizar or /start with an invitation to a private chat.
  if (inbound.chatType !== "private") {
    if (cmd && ["cotizar", "start", "ayuda", "help"].includes(cmd.command)) {
      await send(
        "¡Hola! 👋 Para cotizar con *Instalaciones Eléctricas JG* escríbeme en privado: " +
          `https://t.me/${BOT_USERNAME}?start=cotizar`,
      );
    }
    return;
  }
  console.log("telegram update", { update_id: inbound.updateId, cmd: cmd?.command ?? null, contact: Boolean(inbound.contactPhone) });

  // --- Owner registration (does not create a contacto) ---
  if (cmd?.command === "soyjorge") {
    if (OWNER_CODE && safeEqual(cmd.args, OWNER_CODE)) {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: OWNER_SETTING_KEY, value: String(chatId), updated_at: new Date().toISOString() });
      if (error) {
        console.error("app_settings upsert error:", error);
        await send("No pude guardar tu chat. Revisa los logs de telegram-webhook.");
        return;
      }
      console.log("owner chat registered");
      await send(
        `✅ Listo, Jorge. Este chat (${chatId}) recibirá avisos de nuevos leads y citas pendientes.`,
        REMOVE_KEYBOARD,
      );
    } else {
      console.warn("soyjorge: wrong code");
      await send("Código incorrecto.");
    }
    return;
  }

  if (cmd && (cmd.command === "ayuda" || cmd.command === "help")) {
    await send(AYUDA, REMOVE_KEYBOARD);
    return;
  }

  const isStartCmd = cmd?.command === "start" || cmd?.command === "cotizar";
  if (cmd && !isStartCmd) {
    await send("No conozco ese comando.\n\n" + AYUDA, REMOVE_KEYBOARD);
    return;
  }

  // --- Message text for the flow ---
  let incomingText = "";
  let logText = inbound.text;
  if (inbound.contactPhone) {
    incomingText = inbound.contactPhone;
    logText = `[contacto compartido: ${inbound.contactPhone}]`;
  } else if (!isStartCmd) {
    incomingText = normalizeKeyboardText(inbound.text);
  }
  if (!incomingText && !isStartCmd) {
    await send("Por ahora solo puedo leer mensajes de texto. ✍️");
    return;
  }

  // --- Contacto ---
  const phoneKey = telegramContactId(chatId);
  let { data: contacto } = await supabase
    .from("contactos")
    .select("*")
    .eq("phone_number", phoneKey)
    .maybeSingle();

  let isNew = false;
  if (!contacto) {
    isNew = true;
    const { data: nuevo, error } = await supabase
      .from("contactos")
      .insert({ phone_number: phoneKey, nombre: inbound.profileName || null, estado_bot: "en_proceso" })
      .select()
      .single();
    if (error) throw error;
    contacto = nuevo;
  } else if (isStartCmd && contacto.estado_bot !== "en_proceso") {
    // Customer explicitly asks to start a new quote → hand back to the bot.
    await supabase
      .from("contactos")
      .update({ estado_bot: "en_proceso", updated_at: new Date().toISOString() })
      .eq("id", contacto.id);
    contacto = { ...contacto, estado_bot: "en_proceso" };
  }

  if (logText) {
    await supabase.from("mensajes").insert({ contacto_id: contacto.id, sender: "cliente", contenido: logText });
  }

  const tgLink = inbound.username ? `Telegram: @${inbound.username} (t.me/${inbound.username})` : `Telegram chat id: ${chatId}`;

  // Conversation already handed to a human: forward to Jorge so it is not missed.
  if (contacto.estado_bot === "humano") {
    await notifyOwner(
      supabase,
      formatOwnerNotification({ tipo: "mensaje", canal: CANAL, contacto, extra: `${tgLink}\nMensaje: ${logText}` }),
    );
    return;
  }

  async function logBot(texto: string) {
    await supabase.from("mensajes").insert({ contacto_id: contacto.id, sender: "bot", contenido: texto });
  }

  await runQuoteBotFlow({
    supabase,
    contacto,
    isNew,
    incomingText,
    buttonId: "",
    canal: CANAL,
    questions: TELEGRAM_QUESTIONS,
    reply: async (texto: string) => {
      await send(texto, REMOVE_KEYBOARD);
      await logBot(texto);
    },
    replyChoices: async (texto: string, buttons: { id: string; title: string }[]) => {
      await send(texto, choiceKeyboard(buttons));
      await logBot(texto);
    },
    replyQuestion: async (q: { key: string; text: string }) => {
      await send(q.text, q.key === "telefono" ? contactKeyboard() : REMOVE_KEYBOARD);
      await logBot(q.text);
    },
    onEvent: async (evt) => {
      const slot = evt.slot as { iso?: string; label?: string } | undefined;
      await notifyOwner(
        supabase,
        formatOwnerNotification({
          tipo: evt.type,
          canal: CANAL,
          contacto: evt.contacto,
          datos: evt.datos,
          slotLabel: slot ? slot.label || (slot.iso ? formatSlotLabel(slot.iso) : "") : "",
          extra: tgLink,
        }),
      );
    },
  });
}
