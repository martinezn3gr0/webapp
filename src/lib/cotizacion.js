// Lógica pura de cotizaciones formales (sin React, sin Supabase) para poder
// probarla con `node --test` y reutilizarla en el PDF, el editor y, a futuro,
// órdenes de trabajo / cobranza / facturación.
//
// IMPORTANTE: los totales oficiales los calcula la base de datos
// (trigger `cotizaciones_calcular_totales`). Esta función replica exactamente
// esa fórmula para mostrar totales en vivo mientras Jorge edita.

export const NEGOCIO = Object.freeze({
  nombre: 'Instalaciones Eléctricas JG',
  lema: 'RESIDENCIAL · COMERCIAL · INDUSTRIAL',
  telefono: '+52 56 5810 5587',
  sitio: 'instelecjg.com',
  sitioUrl: 'https://instelecjg.com',
  zona: 'CDMX y Estado de México',
  resenasUrl: 'https://g.page/r/CW3H3kY3PUVfEBI/review',
  colorMarca: '#2E5BFF',
});

export const IVA_TASA_DEFAULT = 0.16;
export const VIGENCIA_DEFAULT = 15;
export const ANTICIPO_DEFAULT = 50;
export const UNIDADES = ['servicio', 'pza', 'm', 'lote', 'salida', 'hr', 'día', 'kit'];
export const TZ = 'America/Mexico_City';
export const BUCKET_PDF = 'cotizaciones-pdf';

/** Convierte lo que venga de un input a número; '' / inválido → 0. */
export function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Redondeo a centavos (half away from zero, como numeric round() de Postgres). */
export function round2(n) {
  const x = toNumber(n);
  return Math.sign(x) * Math.round((Math.abs(x) + Number.EPSILON) * 100) / 100;
}

export function importePartida(p) {
  return round2(toNumber(p?.cantidad) * toNumber(p?.precio_unitario));
}

/** Partidas que realmente se guardan (con concepto). */
export function partidasValidas(partidas = []) {
  return (partidas || []).filter((p) => String(p?.concepto ?? '').trim() !== '');
}

/**
 * Misma fórmula que la BD:
 *   subtotal = Σ importe
 *   base     = max(subtotal - descuento_visita, 0)
 *   iva      = aplica_iva ? round(base * tasa, 2) : 0
 *   total    = base + iva
 */
export function calcularTotales({ partidas = [], aplicaIva = false, ivaTasa = IVA_TASA_DEFAULT, descuentoVisita = 0 } = {}) {
  const subtotal = round2(partidasValidas(partidas).reduce((acc, p) => acc + importePartida(p), 0));
  const descuento = Math.max(round2(descuentoVisita), 0);
  const base = Math.max(round2(subtotal - descuento), 0);
  const iva = aplicaIva ? round2(base * toNumber(ivaTasa)) : 0;
  const total = round2(base + iva);
  return { subtotal, descuento, base, iva, total };
}

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

/** $1,234.50 */
export function formatoMXN(n) {
  return mxn.format(round2(n));
}

export function formatoPorcentaje(tasa) {
  const pct = round2(toNumber(tasa) * 100);
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`;
}

/** Fecha de hoy en CDMX como 'YYYY-MM-DD'. */
export function hoyCDMX(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseISODate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** 'YYYY-MM-DD' → '06/10/2026' */
export function formatoFecha(iso) {
  const d = parseISODate(iso);
  if (!d) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** Fecha en que vence la cotización ('YYYY-MM-DD'). */
export function fechaVencimiento(iso, dias) {
  const d = parseISODate(iso);
  if (!d) return '';
  d.setUTCDate(d.getUTCDate() + Math.max(Math.trunc(toNumber(dias)), 0));
  return d.toISOString().slice(0, 10);
}

export function condicionesDefault(vigenciaDias = VIGENCIA_DEFAULT) {
  const n = Math.max(Math.trunc(toNumber(vigenciaDias)) || VIGENCIA_DEFAULT, 1);
  return (
    `Cotización válida por ${n} días. ` +
    'La visita técnica a domicilio tiene costo y se descuenta del total si contratas el trabajo. ' +
    'Precios en MXN.'
  );
}

/** Línea de anticipo (solo texto informativo). '' si no aplica. */
export function lineaAnticipo(porcentaje, total) {
  const pct = toNumber(porcentaje);
  if (!(pct > 0)) return '';
  const pctTxt = Number.isInteger(pct) ? String(pct) : pct.toFixed(2);
  const monto = toNumber(total) > 0 ? ` (${formatoMXN(round2((toNumber(total) * pct) / 100))})` : '';
  return `Anticipo: ${pctTxt}% del total${monto} para iniciar el trabajo; el resto al terminar.`;
}

/** Texto de condiciones final para el PDF (personalizado o default + anticipo). */
export function textoCondiciones({ condiciones, vigenciaDias, anticipoPorcentaje, total } = {}) {
  const base = String(condiciones ?? '').trim() || condicionesDefault(vigenciaDias);
  const anticipo = lineaAnticipo(anticipoPorcentaje, total);
  return [base, anticipo].filter(Boolean).join('\n');
}

/** Teléfono para mostrar al cliente; Telegram no tiene teléfono real. */
export function contactoCliente(contacto, datos = {}) {
  const raw = String(contacto?.phone_number ?? '');
  if (raw.startsWith('tg:')) {
    const tel = String(datos?.telefono ?? '').trim();
    return tel ? formatoTelefono(tel) : 'Telegram';
  }
  return formatoTelefono(raw || datos?.telefono || '');
}

export function formatoTelefono(raw) {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('52')) return `+52 ${d.slice(2, 4)} ${d.slice(4, 8)} ${d.slice(8)}`;
  if (d.length === 10) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return String(raw ?? '').trim();
}

export function nombreArchivoPdf(folio, { prueba = false } = {}) {
  const safe = String(folio || 'borrador').replace(/[^A-Za-z0-9_-]/g, '');
  return `Cotizacion_${safe}${prueba ? '_PRUEBA' : ''}.pdf`;
}

/** Ruta en Storage: <cotizacion_id>/<archivo>.pdf (la Edge Function valida el prefijo). */
export function rutaPdf(cotizacionId, folio, opts) {
  return `${cotizacionId}/${nombreArchivoPdf(folio, opts)}`;
}

/** Mensaje corto que acompaña al PDF. */
export function mensajeEnvio({ nombre, folio, total, vigenciaDias, prueba = false } = {}) {
  const saludo = String(nombre ?? '').trim() ? `Hola ${String(nombre).trim().split(/\s+/)[0]}` : 'Hola';
  const lines = [
    `${prueba ? '[PRUEBA] ' : ''}${saludo}, te comparto la cotización ${folio} de ${NEGOCIO.nombre}.`,
    `Total: ${formatoMXN(total)} MXN. Válida por ${Math.trunc(toNumber(vigenciaDias)) || VIGENCIA_DEFAULT} días.`,
    `Cualquier duda, responde este mensaje o llámanos al ${NEGOCIO.telefono}.`,
  ];
  return lines.join('\n');
}

/** Normaliza partidas del editor al formato del RPC guardar_cotizacion. */
export function partidasParaGuardar(partidas = []) {
  return partidasValidas(partidas).map((p) => ({
    concepto: String(p.concepto).trim(),
    descripcion: String(p.descripcion ?? '').trim(),
    cantidad: toNumber(p.cantidad) > 0 ? toNumber(p.cantidad) : 1,
    unidad: String(p.unidad ?? '').trim() || 'servicio',
    precio_unitario: Math.max(round2(p.precio_unitario), 0),
  }));
}

/** Errores de validación legibles para Jorge. [] = OK. */
export function validarCotizacion({ partidas = [], descuentoVisita, vigenciaDias, anticipoPorcentaje } = {}) {
  const errores = [];
  const validas = partidasValidas(partidas);
  if (validas.length === 0) errores.push('Agrega al menos un concepto.');
  validas.forEach((p, i) => {
    if (!(toNumber(p.cantidad) > 0)) errores.push(`Concepto ${i + 1}: la cantidad debe ser mayor a 0.`);
    if (toNumber(p.precio_unitario) < 0) errores.push(`Concepto ${i + 1}: el precio no puede ser negativo.`);
    if (p.precio_unitario === '' || p.precio_unitario === null || p.precio_unitario === undefined) {
      errores.push(`Concepto ${i + 1}: escribe el precio unitario.`);
    }
  });
  if (toNumber(descuentoVisita) < 0) errores.push('El descuento por visita no puede ser negativo.');
  const v = toNumber(vigenciaDias);
  if (!(v >= 1 && v <= 365)) errores.push('La vigencia debe estar entre 1 y 365 días.');
  const a = toNumber(anticipoPorcentaje);
  if (a < 0 || a > 100) errores.push('El anticipo debe estar entre 0 y 100%.');
  return errores;
}

export function partidaVacia() {
  return { concepto: '', descripcion: '', cantidad: 1, unidad: 'servicio', precio_unitario: '' };
}
