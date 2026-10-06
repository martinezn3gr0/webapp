import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNED_URL_TTL_SECONDS,
  captionTelegram,
  estatusTrasEnvio,
  textoConEnlace,
  textoRegistro,
  validarDocumentoCotizacion,
} from "./quote-send-utils.js";

const ID = "0ea72f93-b619-4789-a7e5-386d43814fdd";

describe("validarDocumentoCotizacion", () => {
  it("acepta PDFs dentro de la carpeta de la cotización", () => {
    assert.deepEqual(validarDocumentoCotizacion({ path: `${ID}/Cotizacion_COT-2026-0001.pdf` }, ID), {
      ok: true,
      path: `${ID}/Cotizacion_COT-2026-0001.pdf`,
      filename: "Cotizacion_COT-2026-0001.pdf",
    });
  });
  it("rechaza rutas de otra cotización, traversal o no-PDF", () => {
    const otro = "11111111-1111-1111-1111-111111111111";
    assert.equal(validarDocumentoCotizacion({ path: `${otro}/a.pdf` }, ID).ok, false);
    assert.equal(validarDocumentoCotizacion({ path: `${ID}/../${otro}/a.pdf` }, ID).ok, false);
    assert.equal(validarDocumentoCotizacion({ path: `${ID}/sub/a.pdf` }, ID).ok, false);
    assert.equal(validarDocumentoCotizacion({ path: `${ID}/a.exe` }, ID).ok, false);
    assert.equal(validarDocumentoCotizacion({ path: `${ID}/a.pdf` }, "no-uuid").ok, false);
    assert.equal(validarDocumentoCotizacion(null, ID).ok, false);
  });
  it("ignora filenames raros y usa el de la ruta", () => {
    assert.equal(validarDocumentoCotizacion({ path: `${ID}/a.pdf`, filename: "../../x.pdf" }, ID).filename, "a.pdf");
  });
});

describe("textos", () => {
  it("enlace firmado de 30 días", () => {
    assert.equal(SIGNED_URL_TTL_SECONDS, 2592000);
    assert.match(textoConEnlace("Hola", "https://x/y"), /^Hola\n\n📄 Cotización \(PDF, enlace válido 30 días\):\nhttps:\/\/x\/y$/);
  });
  it("caption de Telegram ≤ 1024", () => {
    assert.equal(captionTelegram("x".repeat(2000)).length, 1024);
    assert.equal(captionTelegram(" hola "), "hola");
  });
  it("registro en mensajes", () => {
    assert.equal(textoRegistro("Hola", { filename: "a.pdf", modo: "adjunto" }), "Hola\n\n📎 a.pdf");
    assert.match(textoRegistro("Hola", { modo: "enlace", url: "https://u" }), /https:\/\/u$/);
  });
  it("estatus tras envío", () => {
    assert.equal(estatusTrasEnvio("pendiente"), "enviada");
    assert.equal(estatusTrasEnvio("enviada"), "enviada");
    assert.equal(estatusTrasEnvio("aceptada"), "aceptada");
    assert.equal(estatusTrasEnvio("rechazada"), "rechazada");
  });
});
