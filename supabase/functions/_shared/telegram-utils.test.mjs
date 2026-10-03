import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  choiceKeyboard,
  extractTelegramInbound,
  formatOwnerNotification,
  normalizeKeyboardText,
  normalizePhone,
  notifyOwner,
  parseCommand,
  safeEqual,
  telegramChatIdFromContact,
  telegramContactId,
  toTelegramHtml,
} from "./telegram-utils.js";

describe("telegram-utils", () => {
  it("maps chat ids to contactos.phone_number and back", () => {
    assert.equal(telegramContactId(123), "tg:123");
    assert.equal(telegramChatIdFromContact("tg:123"), "123");
    assert.equal(telegramChatIdFromContact("525512345678"), null);
  });

  it("parses commands", () => {
    assert.deepEqual(parseCommand("/soyjorge ABC123"), { command: "soyjorge", args: "ABC123" });
    assert.deepEqual(parseCommand("/start@Instelecjgbot"), { command: "start", args: "" });
    assert.equal(parseCommand("hola"), null);
  });

  it("normalizes phones", () => {
    assert.equal(normalizePhone("55 1234 5678"), "525512345678");
    assert.equal(normalizePhone("+5215512345678"), "525512345678");
    assert.equal(normalizePhone("+525512345678"), "525512345678");
    assert.equal(normalizePhone("123"), null);
  });

  it("maps numbered keyboard presses to digits", () => {
    assert.equal(normalizeKeyboardText("2) Agendar visita"), "2");
    assert.equal(normalizeKeyboardText("  hola "), "hola");
    const kb = choiceKeyboard([{ id: "a", title: "Solo cotización" }]);
    assert.equal(kb.keyboard[0][0].text, "1) Solo cotización");
  });

  it("escapes HTML and converts *bold*", () => {
    assert.equal(toTelegramHtml("a <b> & *x*"), "a &lt;b&gt; &amp; <b>x</b>");
  });

  it("compares secrets", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("", ""), false);
    assert.equal(safeEqual("abc", "abcd"), false);
  });

  it("extracts inbound text and contact", () => {
    const i = extractTelegramInbound({
      update_id: 9,
      message: { chat: { id: 1, type: "private" }, from: { id: 1, first_name: "Ana" }, contact: { phone_number: "+52155", user_id: 1 } },
    });
    assert.equal(i.chatId, 1);
    assert.equal(i.contactPhone, "+52155");
    assert.equal(i.profileName, "Ana");
    assert.equal(extractTelegramInbound({ edited_message: {} }), null);
  });

  it("notifyOwner skips silently without config", async () => {
    assert.equal(await notifyOwner(null, "x", () => undefined), false);
    assert.equal(await notifyOwner(null, "x", (k) => (k === "TELEGRAM_BOT_TOKEN" ? "t" : "")), false);
  });

  it("formats owner notifications without exposing tg: ids as phones", () => {
    const t = formatOwnerNotification({
      tipo: "cita_pendiente",
      canal: "Telegram",
      contacto: { nombre: "Ana", phone_number: "tg:1" },
      datos: { tipo_servicio: "tablero" },
      slotLabel: "lun 5 oct 09:00",
    });
    assert.match(t, /PENDIENTE/);
    assert.doesNotMatch(t, /Teléfono: tg:/);
  });
});
