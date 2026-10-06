// Genera el PDF formal de la cotización (tamaño carta) en el navegador con jsPDF.
// También funciona en Node (tests / renders), por eso no toca el DOM: el logo
// se recibe ya como data URL.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import {
  NEGOCIO,
  calcularTotales,
  contactoCliente,
  fechaVencimiento,
  formatoFecha,
  formatoMXN,
  formatoPorcentaje,
  importePartida,
  partidasValidas,
  textoCondiciones,
  toNumber,
} from './cotizacion.js';

const AZUL = [46, 91, 255]; // #2E5BFF
const TINTA = [23, 27, 34];
const GRIS = [92, 100, 114];
const LINEA = [222, 226, 232];
const FONDO = [245, 247, 251];
const ROJO = [214, 40, 40];

function fmtCantidad(n) {
  const x = toNumber(n);
  return Number.isInteger(x) ? String(x) : x.toLocaleString('es-MX', { maximumFractionDigits: 3 });
}

/**
 * @param {object} args
 * @param {object} args.cotizacion  fila de cotizaciones (folio, fecha, vigencia_dias, aplica_iva, iva_tasa,
 *                                  descuento_visita, condiciones, anticipo_porcentaje, datos)
 * @param {Array}  args.partidas    [{concepto, descripcion, cantidad, unidad, precio_unitario}]
 * @param {object} args.contacto    {nombre, phone_number}
 * @param {string} [args.logoDataUrl] data:image/jpeg;base64,...
 * @param {boolean} [args.prueba]   marca de agua "PRUEBA"
 * @returns {jsPDF}
 */
export function generarCotizacionPdf({ cotizacion, partidas = [], contacto = {}, logoDataUrl, prueba } = {}) {
  const c = cotizacion || {};
  const datos = c.datos || {};
  const esPrueba = Boolean(prueba ?? datos.prueba);
  const items = partidasValidas(partidas);
  const tot = calcularTotales({
    partidas: items,
    aplicaIva: Boolean(c.aplica_iva),
    ivaTasa: c.iva_tasa ?? 0.16,
    descuentoVisita: c.descuento_visita ?? 0,
  });

  const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(); // 612
  const H = doc.internal.pageSize.getHeight(); // 792
  const M = 40;
  const folio = c.folio || 'BORRADOR';
  const titulo = esPrueba ? 'COTIZACIÓN · PRUEBA' : 'COTIZACIÓN';

  doc.setProperties({
    title: `Cotización ${folio}${esPrueba ? ' (PRUEBA)' : ''}`,
    subject: 'Cotización',
    author: NEGOCIO.nombre,
    creator: NEGOCIO.sitio,
  });

  // ---------- Encabezado ----------
  let y = 34;
  const logoSize = 70;
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, logoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', M, y - 6, logoSize, logoSize);
    } catch {
      /* logo opcional */
    }
  }
  const xText = logoDataUrl ? M + logoSize + 14 : M;
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(NEGOCIO.nombre, xText, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...AZUL);
  doc.setCharSpace(1.2);
  doc.text(NEGOCIO.lema, xText, y + 28);
  doc.setCharSpace(0);
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`Tel. / WhatsApp ${NEGOCIO.telefono}`, xText, y + 44);
  doc.text(`${NEGOCIO.sitio} · ${NEGOCIO.zona}`, xText, y + 57);

  // Bloque derecho: título + folio
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(esPrueba ? 15 : 20);
  doc.setTextColor(...(esPrueba ? ROJO : AZUL));
  doc.text(titulo, W - M, y + 14, { align: 'right' });
  doc.setFontSize(9.5);
  doc.setTextColor(...TINTA);
  doc.setFont('helvetica', 'normal');
  const venc = fechaVencimiento(c.fecha, c.vigencia_dias ?? 15);
  const metaRight = [
    ['Folio:', folio],
    ['Fecha:', formatoFecha(c.fecha)],
    ['Válida hasta:', formatoFecha(venc)],
  ];
  metaRight.forEach(([k, v], i) => {
    const yy = y + 32 + i * 13;
    doc.setFont('helvetica', 'bold');
    doc.text(v || '-', W - M, yy, { align: 'right' });
    const vw = doc.getTextWidth(v || '-');
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(k, W - M - vw - 4, yy, { align: 'right' });
    doc.setTextColor(...TINTA);
  });

  y = 118;
  doc.setFillColor(...AZUL);
  doc.rect(M, y, W - 2 * M, 3, 'F');

  // ---------- Cliente / Vigencia ----------
  y += 16;
  const boxH = 54;
  const colW = (W - 2 * M - 12) / 2;
  const drawBox = (x, label, rows) => {
    doc.setDrawColor(...LINEA);
    doc.setFillColor(...FONDO);
    doc.roundedRect(x, y, colW, boxH, 5, 5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...AZUL);
    doc.setCharSpace(1);
    doc.text(label, x + 12, y + 15);
    doc.setCharSpace(0);
    rows.forEach(([k, v], i) => {
      const yy = y + 30 + i * 13;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRIS);
      doc.text(k, x + 12, yy);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...TINTA);
      const val = doc.splitTextToSize(String(v || '-'), colW - 80)[0];
      doc.text(val, x + 70, yy);
    });
  };
  const nombreCliente = contacto?.nombre || datos.nombre || 'Cliente';
  drawBox(M, 'CLIENTE', [
    ['Nombre', nombreCliente],
    ['Contacto', contactoCliente(contacto, datos)],
  ]);
  const vigTxt = `${Math.trunc(toNumber(c.vigencia_dias) || 15)} días`;
  const servicio = String(datos.tipo_servicio ?? '').trim();
  drawBox(
    M + colW + 12,
    servicio ? 'SERVICIO' : 'VIGENCIA',
    servicio
      ? [
          ['Servicio', servicio],
          ['Vigencia', `${vigTxt} (hasta ${formatoFecha(venc)})`],
        ]
      : [
          ['Vigencia', vigTxt],
          ['Vence', formatoFecha(venc)],
        ]
  );
  y += boxH + 18;

  // ---------- Tabla de conceptos ----------
  const body = items.map((p, i) => [
    String(i + 1),
    { content: String(p.concepto).trim(), descripcion: String(p.descripcion ?? '').trim() },
    fmtCantidad(p.cantidad),
    String(p.unidad || ''),
    formatoMXN(p.precio_unitario),
    formatoMXN(importePartida(p)),
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, bottom: 60, top: 50 },
    head: [['#', 'Concepto', 'Cant.', 'Unidad', 'P. unitario', 'Importe']],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', fontSize: 9.5, textColor: TINTA, cellPadding: { top: 7, bottom: 7, left: 6, right: 6 }, valign: 'top', overflow: 'linebreak' },
    headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5 },
    alternateRowStyles: { fillColor: FONDO },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center', textColor: GRIS },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
      2: { cellWidth: 42, halign: 'right' },
      3: { cellWidth: 56 },
      4: { cellWidth: 78, halign: 'right' },
      5: { cellWidth: 82, halign: 'right', fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 2 && data.column.index !== 3) data.cell.styles.halign = 'right';
      if (data.section === 'body' && data.column.index === 1) {
        const raw = data.cell.raw || {};
        // autotable calcula la altura con concepto + descripción juntos (en negritas,
        // un poco más grande): siempre alcanza para dibujar la descripción más chica.
        data.cell.text = raw.descripcion ? [raw.content, ...String(raw.descripcion).split('\n')] : [raw.content];
      }
    },
    willDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1 && data.cell.raw?.descripcion) {
        const w = data.cell.width - 12;
        doc.setFont('helvetica', 'bold').setFontSize(9.5);
        const concepto = doc.splitTextToSize(data.cell.raw.content, w);
        doc.setFont('helvetica', 'normal').setFontSize(8.5);
        data.cell.descLines = doc.splitTextToSize(data.cell.raw.descripcion, w);
        data.cell.conceptoLines = concepto.length;
        data.cell.text = concepto;
        doc.setFont('helvetica', 'bold').setFontSize(9.5);
      }
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 1 && data.cell.descLines?.length) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...GRIS);
        const x0 = data.cell.x + 6;
        let yy = data.cell.y + 7 + data.cell.conceptoLines * 9.5 * 1.15 + 9;
        data.cell.descLines.forEach((l) => {
          doc.text(l, x0, yy);
          yy += 8.5 * 1.15;
        });
        doc.setTextColor(...TINTA);
      }
    },
  });

  y = doc.lastAutoTable.finalY + 14;

  // ---------- Totales ----------
  const filas = [['Subtotal', formatoMXN(tot.subtotal)]];
  if (tot.descuento > 0) filas.push(['Descuento por visita técnica', `-${formatoMXN(tot.descuento)}`]);
  if (c.aplica_iva) filas.push([`IVA ${formatoPorcentaje(c.iva_tasa ?? 0.16)}`, formatoMXN(tot.iva)]);
  const totH = filas.length * 16 + 34;
  if (y + totH + 90 > H - 60) {
    doc.addPage();
    y = 50;
  }
  const tx = W - M - 250;
  doc.setFontSize(10);
  filas.forEach(([k, v]) => {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS);
    doc.text(k, tx + 10, y + 11);
    doc.setTextColor(...TINTA);
    doc.setFont('helvetica', 'bold');
    doc.text(v, W - M - 10, y + 11, { align: 'right' });
    y += 16;
  });
  y += 4;
  doc.setFillColor(...AZUL);
  doc.roundedRect(tx, y, 250, 28, 4, 4, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('TOTAL', tx + 10, y + 18.5);
  doc.setFontSize(13);
  doc.text(`${formatoMXN(tot.total)} MXN`, W - M - 10, y + 18.5, { align: 'right' });
  y += 28 + 22;

  // ---------- Condiciones ----------
  const condTxt = textoCondiciones({
    condiciones: c.condiciones,
    vigenciaDias: c.vigencia_dias ?? 15,
    anticipoPorcentaje: c.anticipo_porcentaje,
    total: tot.total,
  });
  doc.setFontSize(9);
  const condLines = condTxt
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((l) => doc.splitTextToSize(l, W - 2 * M - 34).map((s, i) => ({ s, bullet: i === 0 })));
  const condH = 28 + condLines.length * 12.5;
  if (y + condH > H - 70) {
    doc.addPage();
    y = 50;
  }
  doc.setDrawColor(...LINEA);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, y, W - 2 * M, condH, 5, 5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...AZUL);
  doc.setCharSpace(1);
  doc.text('CONDICIONES', M + 12, y + 16);
  doc.setCharSpace(0);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  let cy = y + 32;
  condLines.forEach(({ s, bullet }) => {
    if (bullet) {
      doc.setFillColor(...AZUL);
      doc.circle(M + 16, cy - 3, 1.6, 'F');
    }
    doc.text(s, M + 24, cy);
    cy += 12.5;
  });
  y += condH + 18;

  if (y + 30 < H - 60) {
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text(
      `¿Dudas o quieres agendar? Escríbenos o llama al ${NEGOCIO.telefono}. Gracias por tu confianza.`,
      W / 2,
      y + 6,
      { align: 'center' }
    );
  }

  // ---------- Marca de agua de PRUEBA + pie en todas las páginas ----------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (esPrueba) {
      try {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.12 }));
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(110);
        doc.setTextColor(...ROJO);
        doc.text('PRUEBA', W / 2, H / 2 + 40, { align: 'center', angle: 30 });
        doc.restoreGraphicsState();
      } catch {
        /* GState no disponible: queda el título PRUEBA */
      }
    }
    doc.setFillColor(...TINTA);
    doc.rect(0, H - 40, W, 40, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`${NEGOCIO.nombre} · ${NEGOCIO.telefono} · ${NEGOCIO.sitio}`, M, H - 22);
    doc.textWithLink(NEGOCIO.sitio, M, H - 22, { url: NEGOCIO.sitioUrl, renderingMode: 'invisible' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(170, 186, 255);
    doc.textWithLink('Califícanos en Google', M, H - 11, { url: NEGOCIO.resenasUrl });
    doc.setTextColor(200, 205, 214);
    doc.text(`Página ${i} de ${pages}`, W - M, H - 17, { align: 'right' });
  }

  return doc;
}
