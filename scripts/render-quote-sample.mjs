// Genera un PDF de ejemplo con datos ficticios (para revisar el diseño).
// Uso: node scripts/render-quote-sample.mjs [salida.pdf] [--prueba]
import { readFileSync, writeFileSync } from 'node:fs';
import { generarCotizacionPdf } from '../src/lib/quotePdf.js';

const out = process.argv[2] || 'cotizacion-ejemplo.pdf';
const prueba = process.argv.includes('--prueba');
const logo = `data:image/jpeg;base64,${readFileSync(new URL('../public/brand/logo-jg.jpg', import.meta.url)).toString('base64')}`;

const doc = generarCotizacionPdf({
  prueba,
  logoDataUrl: logo,
  contacto: { nombre: 'Cliente de Ejemplo', phone_number: '525512345678' },
  cotizacion: {
    folio: 'COT-2026-0001',
    fecha: '2026-10-06',
    vigencia_dias: 15,
    aplica_iva: true,
    iva_tasa: 0.16,
    descuento_visita: 350,
    anticipo_porcentaje: 50,
    condiciones: null,
    datos: {},
  },
  partidas: [
    { concepto: 'Cambio de centro de carga 8 polos', descripcion: 'Incluye desmontaje del centro de carga anterior, montaje, peinado de cables y pruebas.', cantidad: 1, unidad: 'servicio', precio_unitario: 1000 },
    { concepto: 'Salida eléctrica para contacto', descripcion: 'Ranurado, tubería y cableado calibre 12.', cantidad: 3, unidad: 'salida', precio_unitario: 100 },
    { concepto: 'Cable THW calibre 10', descripcion: '', cantidad: 25, unidad: 'm', precio_unitario: 10 },
  ],
});
writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log('PDF:', out);
