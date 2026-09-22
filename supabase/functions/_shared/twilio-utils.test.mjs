import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  buildTwilioSignaturePayload,
  extractTwilioInbound,
  formatNumberedChoices,
  normalizarTelefonoTwilio,
  parseFormBody,
  timingSafeEqualStr,
  verifyTwilioSignature,
} from "./twilio-utils.js";

/** Node reference implementation of Twilio's signature (HMAC-SHA1 + Base64). */
function nodeTwilioSignature(authToken, url, params) {
  const data = buildTwilioSignaturePayload(url, params);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

describe("normalizarTelefonoTwilio", () => {
  it("strips whatsapp: and non-digits", () => {
    assert.equal(normalizarTelefonoTwilio("whatsapp:+5215512345678"), "5215512345678");
    assert.equal(normalizarTelefonoTwilio("+52 55 1234-5678"), "525512345678");
  });
});

describe("parseFormBody / extractTwilioInbound", () => {
  it("parses Twilio Messaging fields", () => {
    const raw =
      "From=" +
      encodeURIComponent("whatsapp:+14155552671") +
      "&Body=" +
      encodeURIComponent("Hola Jorge") +
      "&ProfileName=Ana";
    const params = parseFormBody(raw);
    const inbound = extractTwilioInbound(params);
    assert.equal(inbound.phoneNumber, "14155552671");
    assert.equal(inbound.incomingText, "Hola Jorge");
    assert.equal(inbound.profileName, "Ana");
  });

  it("reads ButtonPayload when present", () => {
    const inbound = extractTwilioInbound({
      From: "whatsapp:+15551212",
      Body: "Solo cotización",
      ButtonPayload: "solo_cotizacion",
    });
    assert.equal(inbound.buttonId, "solo_cotizacion");
  });
});

describe("formatNumberedChoices", () => {
  it("appends numbers when body has none", () => {
    const out = formatNumberedChoices("Elige:", [
      { id: "a", title: "Uno" },
      { id: "b", title: "Dos" },
    ]);
    assert.match(out, /1\) Uno/);
    assert.match(out, /2\) Dos/);
  });

  it("does not duplicate when already numbered", () => {
    const body = "Opciones:\n1) Solo\n2) Agendar";
    assert.equal(formatNumberedChoices(body, [{ id: "x", title: "Solo" }]), body);
  });
});

describe("verifyTwilioSignature", () => {
  const authToken = "test_auth_token_12345";
  const url = "https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/twilio-whatsapp-webhook";
  const params = {
    Body: "hola",
    From: "whatsapp:+5215511112222",
    To: "whatsapp:+14155238886",
    AccountSid: "ACxxxxxxxx",
  };

  it("accepts a valid signature", async () => {
    const sig = nodeTwilioSignature(authToken, url, params);
    assert.equal(await verifyTwilioSignature(authToken, url, params, sig), true);
  });

  it("rejects a wrong signature", async () => {
    assert.equal(await verifyTwilioSignature(authToken, url, params, "bogus"), false);
  });

  it("rejects when URL differs (signature base must match Twilio config)", async () => {
    const sig = nodeTwilioSignature(authToken, url, params);
    const other = url + "/";
    assert.equal(await verifyTwilioSignature(authToken, other, params, sig), false);
  });
});

describe("timingSafeEqualStr", () => {
  it("compares equal and unequal", () => {
    assert.equal(timingSafeEqualStr("abc", "abc"), true);
    assert.equal(timingSafeEqualStr("abc", "abd"), false);
    assert.equal(timingSafeEqualStr("ab", "abc"), false);
  });
});
