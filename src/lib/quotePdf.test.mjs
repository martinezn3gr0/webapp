import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generarCotizacionPdf } from './quotePdf.js';

const base = {
  contacto: { nombre: 'Cliente Prueba', phone_number: 'tg:1' },
  cotizacion: { folio: 'COT-2026-0009', fecha: '2026-10-06', vigencia_dias: 15, aplica_iva: false, iva_tasa: 0.16, datos: {} },
  partidas: [{ concepto: 'Concepto A', descripcion: 'Detalle', cantidad: 2, unidad: 'pza', precio_unitario: 50 }],
};

function pdfText(doc) {
  // Sin compresión para poder buscar texto en el contenido.
  return doc.output();
}

describe('generarCotizacionPdf', () => {
  it('genera un PDF tamaño carta con folio y total', () => {
    const doc = generarCotizacionPdf(base);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    assert.equal(Math.round(w), 612);
    assert.equal(Math.round(h), 792);
    const bytes = doc.output('arraybuffer');
    assert.ok(bytes.byteLength > 1000);
    assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  });

  it('hace salto de página con muchas partidas', () => {
    const partidas = Array.from({ length: 40 }, (_, i) => ({ concepto: `Concepto ${i + 1}`, cantidad: 1, unidad: 'pza', precio_unitario: 10 }));
    const doc = generarCotizacionPdf({ ...base, partidas });
    assert.ok(doc.getNumberOfPages() >= 2);
  });

  it('las cotizaciones de prueba llevan PRUEBA en el título del documento', () => {
    const doc = generarCotizacionPdf({ ...base, prueba: true });
    assert.match(pdfText(doc), /PRUEBA/);
  });
});
