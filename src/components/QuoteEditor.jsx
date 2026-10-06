import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import {
  ANTICIPO_DEFAULT,
  BUCKET_PDF,
  IVA_TASA_DEFAULT,
  UNIDADES,
  VIGENCIA_DEFAULT,
  calcularTotales,
  condicionesDefault,
  fechaVencimiento,
  formatoFecha,
  formatoMXN,
  formatoPorcentaje,
  hoyCDMX,
  importePartida,
  mensajeEnvio,
  nombreArchivoPdf,
  partidaVacia,
  partidasParaGuardar,
  rutaPdf,
  toNumber,
  validarCotizacion,
} from '../lib/cotizacion.js';
import './QuoteEditor.css';

let logoPromise = null;
function cargarLogo() {
  if (!logoPromise) {
    logoPromise = fetch('/brand/logo-jg.jpg')
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (blob) =>
          blob &&
          new Promise((resolve) => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.onerror = () => resolve(null);
            fr.readAsDataURL(blob);
          })
      )
      .catch(() => null);
  }
  return logoPromise;
}

function numOrEmpty(v) {
  return v === null || v === undefined ? '' : String(v);
}

let keySeq = 0;
const withKey = (p) => ({ ...p, _key: `p${++keySeq}` });

/**
 * Editor de cotización formal (partidas, IVA, descuento por visita, vigencia,
 * condiciones) + PDF + envío al cliente.
 */
export default function QuoteEditor({ cotizacion: inicial, contacto, onClose, onSaved }) {
  const [cot, setCot] = useState(inicial);
  const [partidas, setPartidas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [fecha, setFecha] = useState(inicial.fecha || hoyCDMX());
  const [vigencia, setVigencia] = useState(numOrEmpty(inicial.vigencia_dias ?? VIGENCIA_DEFAULT));
  const [aplicaIva, setAplicaIva] = useState(Boolean(inicial.aplica_iva));
  const [ivaPct, setIvaPct] = useState(String(Math.round(toNumber(inicial.iva_tasa ?? IVA_TASA_DEFAULT) * 10000) / 100));
  const [descuento, setDescuento] = useState(numOrEmpty(inicial.descuento_visita));
  const [anticipo, setAnticipo] = useState(
    inicial.folio ? numOrEmpty(inicial.anticipo_porcentaje) : String(inicial.anticipo_porcentaje ?? ANTICIPO_DEFAULT)
  );
  const [condiciones, setCondiciones] = useState(
    inicial.condiciones || condicionesDefault(inicial.vigencia_dias ?? VIGENCIA_DEFAULT)
  );
  const [mensaje, setMensaje] = useState('');
  const [mensajeEditado, setMensajeEditado] = useState(false);
  const [dirty, setDirty] = useState(!inicial.folio);
  const [busy, setBusy] = useState('');
  const [errores, setErrores] = useState([]);
  const [aviso, setAviso] = useState('');
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const listaRef = useRef(null);

  const esPrueba = Boolean(cot?.datos?.prueba);
  const nombre = contacto?.nombre || cot?.datos?.nombre || '';
  const canal = String(contacto?.phone_number ?? '').startsWith('tg:') ? 'Telegram' : 'WhatsApp';

  // Cargar partidas existentes
  useEffect(() => {
    let active = true;
    supabase
      .from('cotizacion_partidas')
      .select('concepto, descripcion, cantidad, unidad, precio_unitario, orden')
      .eq('cotizacion_id', inicial.id)
      .order('orden', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setErrores([`No se pudieron cargar los conceptos: ${error.message}`]);
        const rows = (data ?? []).map((p) =>
          withKey({ ...p, descripcion: p.descripcion ?? '', cantidad: String(p.cantidad), precio_unitario: String(p.precio_unitario) })
        );
        setPartidas(rows.length ? rows : [withKey(partidaVacia())]);
        setCargando(false);
      });
    return () => {
      active = false;
    };
  }, [inicial.id]);

  // Bloquear scroll del fondo mientras el editor está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ivaTasa = toNumber(ivaPct) / 100;
  const totales = useMemo(
    () => calcularTotales({ partidas, aplicaIva, ivaTasa, descuentoVisita: descuento }),
    [partidas, aplicaIva, ivaTasa, descuento]
  );

  const folioMostrado = cot.folio || 'Se asigna al guardar';

  useEffect(() => {
    if (!mensajeEditado) {
      setMensaje(
        mensajeEnvio({ nombre, folio: cot.folio || 'COT-…', total: totales.total, vigenciaDias: vigencia, prueba: esPrueba })
      );
    }
  }, [nombre, cot.folio, totales.total, vigencia, esPrueba, mensajeEditado]);

  function marcar() {
    setDirty(true);
    setAviso('');
    setErrores([]);
  }

  function actualizarPartida(i, campo, valor) {
    setPartidas((prev) => prev.map((p, idx) => (idx === i ? { ...p, [campo]: valor } : p)));
    marcar();
  }

  function agregarPartida() {
    setPartidas((prev) => [...prev, withKey(partidaVacia())]);
    marcar();
    setTimeout(() => {
      const inputs = listaRef.current?.querySelectorAll('.qe-item__concepto');
      inputs?.[inputs.length - 1]?.focus();
    }, 0);
  }

  function quitarPartida(i) {
    setPartidas((prev) => (prev.length <= 1 ? [withKey(partidaVacia())] : prev.filter((_, idx) => idx !== i)));
    marcar();
  }

  function moverPartida(i, dir) {
    setPartidas((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    marcar();
  }

  function cambiarVigencia(v) {
    // Si las condiciones son el texto por defecto, se actualizan con la nueva vigencia.
    if (condiciones.trim() === condicionesDefault(vigencia).trim()) setCondiciones(condicionesDefault(v));
    setVigencia(v);
    marcar();
  }

  async function guardar() {
    const errs = validarCotizacion({ partidas, descuentoVisita: descuento, vigenciaDias: vigencia, anticipoPorcentaje: anticipo });
    if (aplicaIva && !(ivaTasa > 0 && ivaTasa < 1)) errs.push('La tasa de IVA debe estar entre 0 y 99%.');
    if (errs.length) {
      setErrores(errs);
      return null;
    }
    setBusy('guardar');
    setErrores([]);
    const { data, error } = await supabase.rpc('guardar_cotizacion', {
      p_cotizacion_id: cot.id,
      p_campos: {
        fecha,
        vigencia_dias: Math.trunc(toNumber(vigencia)),
        aplica_iva: aplicaIva,
        iva_tasa: ivaTasa || IVA_TASA_DEFAULT,
        descuento_visita: descuento === '' ? '' : toNumber(descuento),
        condiciones: condiciones.trim() === condicionesDefault(vigencia).trim() ? '' : condiciones,
        anticipo_porcentaje: anticipo === '' ? '' : toNumber(anticipo),
      },
      p_partidas: partidasParaGuardar(partidas),
    });
    setBusy('');
    if (error) {
      setErrores([
        /permission|row-level|rls/i.test(error.message)
          ? 'No tienes permiso para guardar esta cotización.'
          : `No se pudo guardar: ${error.message}`,
      ]);
      return null;
    }
    const row = Array.isArray(data) ? data[0] : data;
    setCot(row);
    setDirty(false);
    setAviso(`Guardada · ${row.folio} · Total ${formatoMXN(row.total)}`);
    onSaved?.(row);
    return row;
  }

  async function asegurarGuardada() {
    if (!dirty && cot.folio) return cot;
    return guardar();
  }

  async function construirPdf(row) {
    const [{ generarCotizacionPdf }, logo] = await Promise.all([import('../lib/quotePdf.js'), cargarLogo()]);
    return generarCotizacionPdf({
      cotizacion: row,
      partidas: partidasParaGuardar(partidas),
      contacto,
      logoDataUrl: logo || undefined,
    });
  }

  async function descargarPdf() {
    const row = await asegurarGuardada();
    if (!row) return;
    setBusy('pdf');
    try {
      const doc = await construirPdf(row);
      doc.save(nombreArchivoPdf(row.folio, { prueba: Boolean(row.datos?.prueba) }));
      setAviso('PDF descargado.');
    } catch (err) {
      setErrores([`No se pudo generar el PDF: ${String(err?.message || err)}`]);
    } finally {
      setBusy('');
    }
  }

  async function enviar() {
    setConfirmarEnvio(false);
    const row = await asegurarGuardada();
    if (!row) return;
    if (!mensaje.trim()) {
      setErrores(['Escribe el mensaje que acompaña al PDF.']);
      return;
    }
    setBusy('enviar');
    setErrores([]);
    try {
      const doc = await construirPdf(row);
      const blob = doc.output('blob');
      const prueba = Boolean(row.datos?.prueba);
      const path = rutaPdf(row.id, row.folio, { prueba });
      const filename = nombreArchivoPdf(row.folio, { prueba });
      const { error: upError } = await supabase.storage
        .from(BUCKET_PDF)
        .upload(path, blob, { contentType: 'application/pdf', upsert: true, cacheControl: '60' });
      if (upError) throw new Error(`No se pudo subir el PDF: ${upError.message}`);

      const texto = mensajeEditado ? mensaje : mensajeEnvio({ nombre, folio: row.folio, total: row.total, vigenciaDias: row.vigencia_dias, prueba });
      const { data, error } = await supabase.functions.invoke('send-message', {
        body: { contacto_id: contacto.id, contenido: texto.trim(), cotizacion_id: row.id, documento: { path, filename } },
      });
      if (error) {
        let detalle = '';
        try {
          detalle = (await error.context?.json?.())?.error || '';
        } catch {
          /* sin detalle */
        }
        throw new Error(`No se pudo enviar${detalle ? `: ${detalle}` : '. Intenta de nuevo.'}`);
      }
      const actualizado = {
        ...row,
        estatus: row.estatus === 'aceptada' || row.estatus === 'rechazada' ? row.estatus : 'enviada',
        sent_at: data?.sent_at || new Date().toISOString(),
        pdf_path: path,
      };
      setCot(actualizado);
      onSaved?.(actualizado);
      setAviso(
        data?.documento === 'adjunto'
          ? `Enviada por ${canal} con el PDF adjunto.`
          : `Enviada por ${canal} con enlace al PDF (válido 30 días).`
      );
    } catch (err) {
      setErrores([String(err?.message || err)]);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="qe-overlay" role="dialog" aria-modal="true" aria-label="Cotización formal">
      <div className="qe">
        <header className="qe__header">
          <div>
            <p className="qe__eyebrow">
              Cotización formal {esPrueba && <span className="qe__prueba">PRUEBA</span>}
            </p>
            <h2 className="qe__title">{folioMostrado}</h2>
            <p className="qe__sub">
              {nombre || 'Cliente'} · {canal}
              {cot.sent_at && ` · enviada ${new Date(cot.sent_at).toLocaleDateString('es-MX')}`}
            </p>
          </div>
          <button type="button" className="qe__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>

        <div className="qe__body">
          <section className="qe__section qe__grid3">
            <label className="qe-field">
              Fecha
              <input type="date" value={fecha} onChange={(e) => { setFecha(e.target.value); marcar(); }} />
            </label>
            <label className="qe-field">
              Vigencia (días)
              <input type="number" inputMode="numeric" min="1" max="365" value={vigencia} onChange={(e) => cambiarVigencia(e.target.value)} />
            </label>
            <p className="qe-field qe-field--static">
              Vence
              <strong>{formatoFecha(fechaVencimiento(fecha, vigencia)) || '—'}</strong>
            </p>
          </section>

          <section className="qe__section">
            <div className="qe__section-head">
              <h3>Conceptos</h3>
              <span className="qe__hint">Tú pones cada precio</span>
            </div>
            {cargando ? (
              <p className="qe__hint">Cargando…</p>
            ) : (
              <ol className="qe-items" ref={listaRef}>
                {partidas.map((p, i) => (
                  <li key={p._key} className="qe-item">
                    <div className="qe-item__top">
                      <span className="qe-item__num">{i + 1}</span>
                      <input
                        className="qe-item__concepto"
                        type="text"
                        placeholder="Concepto (ej. Cambio de centro de carga)"
                        value={p.concepto}
                        onChange={(e) => actualizarPartida(i, 'concepto', e.target.value)}
                        aria-label={`Concepto ${i + 1}`}
                      />
                      <div className="qe-item__tools">
                        <button type="button" onClick={() => moverPartida(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                        <button type="button" onClick={() => moverPartida(i, 1)} disabled={i === partidas.length - 1} aria-label="Bajar">↓</button>
                        <button type="button" className="qe-item__remove" onClick={() => quitarPartida(i)} aria-label={`Quitar concepto ${i + 1}`}>✕</button>
                      </div>
                    </div>
                    <textarea
                      className="qe-item__desc"
                      rows={2}
                      placeholder="Descripción (opcional)"
                      value={p.descripcion}
                      onChange={(e) => actualizarPartida(i, 'descripcion', e.target.value)}
                    />
                    <div className="qe-item__nums">
                      <label>
                        Cant.
                        <input type="number" inputMode="decimal" min="0" step="any" value={p.cantidad} onChange={(e) => actualizarPartida(i, 'cantidad', e.target.value)} />
                      </label>
                      <label>
                        Unidad
                        <input type="text" list="qe-unidades" value={p.unidad} onChange={(e) => actualizarPartida(i, 'unidad', e.target.value)} />
                      </label>
                      <label>
                        P. unitario
                        <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="$0.00" value={p.precio_unitario} onChange={(e) => actualizarPartida(i, 'precio_unitario', e.target.value)} />
                      </label>
                      <p className="qe-item__importe">
                        Importe
                        <strong>{formatoMXN(importePartida(p))}</strong>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <datalist id="qe-unidades">
              {UNIDADES.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <button type="button" className="qe__add" onClick={agregarPartida}>
              + Agregar concepto
            </button>
          </section>

          <section className="qe__section qe__grid2">
            <label className="qe-field">
              Descuento por visita técnica ($)
              <input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Opcional" value={descuento} onChange={(e) => { setDescuento(e.target.value); marcar(); }} />
            </label>
            <label className="qe-field">
              Anticipo (%) <span className="qe__hint">solo texto en el PDF</span>
              <input type="number" inputMode="decimal" min="0" max="100" step="1" placeholder="Sin anticipo" value={anticipo} onChange={(e) => { setAnticipo(e.target.value); marcar(); }} />
            </label>
            <div className="qe-field qe-iva">
              <label className="qe-switch">
                <input type="checkbox" checked={aplicaIva} onChange={(e) => { setAplicaIva(e.target.checked); marcar(); }} />
                <span>Agregar IVA</span>
              </label>
              {aplicaIva && (
                <label className="qe-iva__tasa">
                  Tasa
                  <input type="number" inputMode="decimal" min="0" max="99" step="0.01" value={ivaPct} onChange={(e) => { setIvaPct(e.target.value); marcar(); }} />
                  %
                </label>
              )}
            </div>
          </section>

          <section className="qe__section">
            <div className="qe__section-head">
              <h3>Condiciones</h3>
              <button type="button" className="qe__link" onClick={() => { setCondiciones(condicionesDefault(vigencia)); marcar(); }}>
                Usar texto por defecto
              </button>
            </div>
            <textarea className="qe__textarea" rows={4} value={condiciones} onChange={(e) => { setCondiciones(e.target.value); marcar(); }} />
            <p className="qe__hint">Una condición por línea. La línea de anticipo se agrega sola si pones un porcentaje.</p>
          </section>

          <section className="qe__section">
            <div className="qe__section-head">
              <h3>Mensaje para el cliente</h3>
              {mensajeEditado && (
                <button type="button" className="qe__link" onClick={() => setMensajeEditado(false)}>
                  Restaurar
                </button>
              )}
            </div>
            <textarea
              className="qe__textarea"
              rows={4}
              value={mensaje}
              onChange={(e) => { setMensaje(e.target.value); setMensajeEditado(true); }}
            />
            <p className="qe__hint">
              {canal === 'Telegram'
                ? 'Por Telegram se manda el PDF como archivo con este mensaje.'
                : 'Por WhatsApp se manda este mensaje con un enlace seguro al PDF (válido 30 días).'}
            </p>
          </section>

          {errores.length > 0 && (
            <ul className="qe__errores" role="alert">
              {errores.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="qe__footer">
          <dl className="qe-totales">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatoMXN(totales.subtotal)}</dd>
            </div>
            {totales.descuento > 0 && (
              <div>
                <dt>Desc. visita técnica</dt>
                <dd>-{formatoMXN(totales.descuento)}</dd>
              </div>
            )}
            {aplicaIva && (
              <div>
                <dt>IVA {formatoPorcentaje(ivaTasa)}</dt>
                <dd>{formatoMXN(totales.iva)}</dd>
              </div>
            )}
            <div className="qe-totales__total">
              <dt>Total</dt>
              <dd>{formatoMXN(totales.total)}</dd>
            </div>
          </dl>
          {aviso && <p className="qe__aviso">{aviso}</p>}
          <div className="qe__actions">
            <button type="button" className="qe-btn qe-btn--ghost" onClick={guardar} disabled={Boolean(busy)}>
              {busy === 'guardar' ? 'Guardando…' : dirty ? 'Guardar' : 'Guardado ✓'}
            </button>
            <button type="button" className="qe-btn" onClick={descargarPdf} disabled={Boolean(busy)}>
              {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
            </button>
            <button type="button" className="qe-btn qe-btn--primary" onClick={() => setConfirmarEnvio(true)} disabled={Boolean(busy)}>
              {busy === 'enviar' ? 'Enviando…' : 'Enviar al cliente'}
            </button>
          </div>
        </footer>

        {confirmarEnvio && (
          <div className="qe-confirm" role="alertdialog" aria-label="Confirmar envío">
            <div className="qe-confirm__box">
              <p>
                ¿Enviar la cotización <strong>{cot.folio || '(se asigna folio)'}</strong> por{' '}
                <strong>{formatoMXN(totales.total)}</strong> a <strong>{nombre || 'el cliente'}</strong> por {canal}?
              </p>
              <div className="qe-confirm__actions">
                <button type="button" className="qe-btn qe-btn--ghost" onClick={() => setConfirmarEnvio(false)}>
                  Cancelar
                </button>
                <button type="button" className="qe-btn qe-btn--primary" onClick={enviar}>
                  Sí, enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
