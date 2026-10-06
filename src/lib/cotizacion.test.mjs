import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularTotales,
  condicionesDefault,
  contactoCliente,
  fechaVencimiento,
  formatoFecha,
  formatoMXN,
  hoyCDMX,
  importePartida,
  lineaAnticipo,
  mensajeEnvio,
  nombreArchivoPdf,
  partidasParaGuardar,
  round2,
  rutaPdf,
  textoCondiciones,
  toNumber,
  validarCotizacion,
} from './cotizacion.js';

describe('números', () => {
  it('toNumber tolera vacíos, comas y signos de pesos', () => {
    assert.equal(toNumber(''), 0);
    assert.equal(toNumber(null), 0);
    assert.equal(toNumber('$1,250.50'), 1250.5);
    assert.equal(toNumber('abc'), 0);
  });
  it('round2 redondea a centavos', () => {
    assert.equal(round2(1.005), 1.01);
    assert.equal(round2(2.675), 2.68);
    assert.equal(round2(-1.005), -1.01);
  });
  it('importe = cantidad × precio', () => {
    assert.equal(importePartida({ cantidad: '2.5', precio_unitario: '100' }), 250);
    assert.equal(importePartida({ cantidad: 3, precio_unitario: 33.333 }), 100);
  });
});

describe('calcularTotales (misma fórmula que el trigger de la BD)', () => {
  const partidas = [
    { concepto: 'Cable', cantidad: 2.5, precio_unitario: 100 },
    { concepto: 'Mano de obra', cantidad: 1, precio_unitario: 1000 },
    { concepto: '   ', cantidad: 1, precio_unitario: 999 }, // ignorada
  ];
  it('sin IVA ni descuento', () => {
    assert.deepEqual(calcularTotales({ partidas }), { subtotal: 1250, descuento: 0, base: 1250, iva: 0, total: 1250 });
  });
  it('IVA sobre (subtotal - descuento), igual que en la BD (caso verificado: 1102)', () => {
    const t = calcularTotales({ partidas, aplicaIva: true, ivaTasa: 0.16, descuentoVisita: 300 });
    assert.deepEqual(t, { subtotal: 1250, descuento: 300, base: 950, iva: 152, total: 1102 });
  });
  it('el descuento nunca deja el total negativo', () => {
    assert.equal(calcularTotales({ partidas, descuentoVisita: 5000 }).total, 0);
  });
});

describe('formatos', () => {
  it('MXN', () => {
    assert.equal(formatoMXN(1234.5), '$1,234.50');
    assert.equal(formatoMXN(0), '$0.00');
  });
  it('fechas', () => {
    assert.equal(formatoFecha('2026-10-06'), '06/10/2026');
    assert.equal(fechaVencimiento('2026-10-06', 15), '2026-10-21');
    assert.equal(fechaVencimiento('2026-12-25', 15), '2027-01-09');
    assert.equal(formatoFecha(''), '');
  });
  it('hoyCDMX usa la zona de CDMX', () => {
    // 2026-10-07 03:00 UTC = 2026-10-06 21:00 en CDMX
    assert.equal(hoyCDMX(new Date('2026-10-07T03:00:00Z')), '2026-10-06');
  });
  it('contacto del cliente', () => {
    assert.equal(contactoCliente({ phone_number: '525658105587' }), '+52 56 5810 5587');
    assert.equal(contactoCliente({ phone_number: 'tg:123' }), 'Telegram');
    assert.equal(contactoCliente({ phone_number: 'tg:123' }, { telefono: '5512345678' }), '55 1234 5678');
  });
  it('nombres de archivo y rutas seguras', () => {
    assert.equal(nombreArchivoPdf('COT-2026-0001'), 'Cotizacion_COT-2026-0001.pdf');
    assert.equal(nombreArchivoPdf('COT-2026-0001', { prueba: true }), 'Cotizacion_COT-2026-0001_PRUEBA.pdf');
    assert.equal(nombreArchivoPdf('../x/y'), 'Cotizacion_xy.pdf');
    assert.equal(rutaPdf('abc', 'COT-2026-0002'), 'abc/Cotizacion_COT-2026-0002.pdf');
  });
});

describe('condiciones', () => {
  it('texto por defecto', () => {
    assert.equal(
      condicionesDefault(15),
      'Cotización válida por 15 días. La visita técnica a domicilio tiene costo y se descuenta del total si contratas el trabajo. Precios en MXN.'
    );
  });
  it('anticipo solo si hay porcentaje', () => {
    assert.equal(lineaAnticipo(null, 1000), '');
    assert.equal(lineaAnticipo(50, 1000), 'Anticipo: 50% del total ($500.00) para iniciar el trabajo; el resto al terminar.');
  });
  it('condiciones personalizadas + anticipo', () => {
    const t = textoCondiciones({ condiciones: 'Garantía 3 meses.', anticipoPorcentaje: 50, total: 200 });
    assert.equal(t, 'Garantía 3 meses.\nAnticipo: 50% del total ($100.00) para iniciar el trabajo; el resto al terminar.');
    assert.match(textoCondiciones({ vigenciaDias: 30 }), /válida por 30 días/);
  });
});

describe('guardar / validar', () => {
  it('partidasParaGuardar limpia y normaliza', () => {
    assert.deepEqual(
      partidasParaGuardar([
        { concepto: ' Foco ', descripcion: ' ', cantidad: '0', unidad: '', precio_unitario: '10.005' },
        { concepto: '', precio_unitario: 5 },
      ]),
      [{ concepto: 'Foco', descripcion: '', cantidad: 1, unidad: 'servicio', precio_unitario: 10.01 }]
    );
  });
  it('validarCotizacion exige concepto y precio escrito por Jorge', () => {
    assert.deepEqual(validarCotizacion({ partidas: [], vigenciaDias: 15 }), ['Agrega al menos un concepto.']);
    const errs = validarCotizacion({ partidas: [{ concepto: 'X', cantidad: 1, precio_unitario: '' }], vigenciaDias: 15 });
    assert.ok(errs.some((e) => /precio unitario/.test(e)));
    assert.deepEqual(validarCotizacion({ partidas: [{ concepto: 'X', cantidad: 1, precio_unitario: 0 }], vigenciaDias: 15 }), []);
    assert.ok(validarCotizacion({ partidas: [{ concepto: 'X', cantidad: 1, precio_unitario: 1 }], vigenciaDias: 0 }).length);
  });
  it('mensaje de envío', () => {
    const m = mensajeEnvio({ nombre: 'Jorge Martínez', folio: 'COT-2026-0001', total: 1102, vigenciaDias: 15, prueba: true });
    assert.match(m, /^\[PRUEBA\] Hola Jorge, te comparto la cotización COT-2026-0001/);
    assert.match(m, /\$1,102\.00 MXN/);
  });
});
