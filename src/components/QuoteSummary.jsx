import { lazy, Suspense, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import './QuoteSummary.css';

// El editor (y jsPDF) se cargan solo cuando Jorge abre una cotización formal.
const QuoteEditor = lazy(() => import('./QuoteEditor'));

const MONTO_KEYS = new Set(['monto', 'precio', 'prueba']);
const ESTATUS_OPCIONES = [
  { value: 'enviada', label: 'Enviada' },
  { value: 'aceptada', label: 'Aceptada' },
  { value: 'rechazada', label: 'Rechazada' },
];

function formatoMonto(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function etiquetaCotizacion(c) {
  const fecha = new Date(c.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
  return c.folio ? `${c.folio} · ${formatoMonto(c.total ?? 0)}` : `Solicitud ${fecha}`;
}

export default function QuoteSummary({ contactoId, contacto }) {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [cotizacion, setCotizacion] = useState(null);
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  const [monto, setMonto] = useState('');
  const [estatus, setEstatus] = useState('enviada');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (!contactoId) return;
    let active = true;
    setError(null);
    setSaveMsg('');
    setSaveError('');

    setCotizaciones([]);
    setCotizacion(null);
    setEditorAbierto(false);

    supabase
      .from('cotizaciones')
      .select('*')
      .eq('contacto_id', contactoId)
      .order('created_at', { ascending: false })
      .limit(20)
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setCotizaciones(data ?? []);
        seleccionar(data?.[0] ?? null);
      });

    return () => {
      active = false;
    };
  }, [contactoId]);

  function seleccionar(data) {
    setCotizacion(data);
    setSaveMsg('');
    setSaveError('');
    if (data) {
      const datos = data.datos || {};
      const raw = datos.monto ?? datos.precio ?? '';
      setMonto(raw === '' || raw === null || raw === undefined ? '' : String(raw));
      setEstatus(
        ['enviada', 'aceptada', 'rechazada', 'pendiente'].includes(data.estatus)
          ? data.estatus === 'pendiente'
            ? 'enviada'
            : data.estatus
          : 'enviada'
      );
    }
  }

  function actualizarLocal(row) {
    setCotizaciones((prev) => {
      const exists = prev.some((c) => c.id === row.id);
      return exists ? prev.map((c) => (c.id === row.id ? { ...c, ...row } : c)) : [row, ...prev];
    });
    seleccionar(row);
  }

  async function nuevaCotizacion() {
    if (creando) return;
    setCreando(true);
    setSaveError('');
    const { data, error: insertError } = await supabase
      .from('cotizaciones')
      .insert({
        contacto_id: contactoId,
        estatus: 'pendiente',
        datos: { fuente: 'panel', ...(contacto?.nombre ? { nombre: contacto.nombre } : {}) },
      })
      .select('*')
      .single();
    setCreando(false);
    if (insertError) {
      setSaveError('No se pudo crear la cotización.');
      return;
    }
    actualizarLocal(data);
    setEditorAbierto(true);
  }

  async function handleGuardar(e) {
    e.preventDefault();
    if (!cotizacion) return;

    const montoNum = monto === '' ? null : Number(monto);
    if (monto !== '' && (Number.isNaN(montoNum) || montoNum < 0)) {
      setSaveError('El monto debe ser un número válido en MXN.');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSaveMsg('');

    const datos = { ...(cotizacion.datos || {}) };
    if (montoNum === null) {
      delete datos.monto;
    } else {
      datos.monto = montoNum;
    }

    const { data, error: updateError } = await supabase
      .from('cotizaciones')
      .update({ datos, estatus })
      .eq('id', cotizacion.id)
      .select('*')
      .single();

    setSaving(false);

    if (updateError) {
      setSaveError(
        /row-level security|rls|permission/i.test(updateError.message)
          ? 'No tienes permiso para actualizar la cotización.'
          : 'No se pudo guardar. Intenta de nuevo.'
      );
      return;
    }

    actualizarLocal(data);
    setSaveMsg('Guardado');
  }

  if (error) {
    return <p className="quote-summary__error">No se pudo cargar la cotización: {error}</p>;
  }

  if (!cotizacion) {
    if (!contactoId) return null;
    return (
      <div className="quote-summary quote-summary--empty">
        <span className="quote-summary__label">SIN COTIZACIÓN</span>
        <button type="button" className="quote-summary__formal-btn" onClick={nuevaCotizacion} disabled={creando}>
          {creando ? 'Creando…' : '+ Cotización formal'}
        </button>
        {saveError && <p className="quote-summary__save-error">{saveError}</p>}
      </div>
    );
  }

  const datos = cotizacion.datos || {};
  const esFormal = Boolean(cotizacion.folio);
  const editor = editorAbierto && (
    <Suspense fallback={<div className="quote-summary__loading-editor">Abriendo editor…</div>}>
      <QuoteEditor
        key={cotizacion.id}
        cotizacion={cotizacion}
        contacto={contacto}
        onClose={() => setEditorAbierto(false)}
        onSaved={actualizarLocal}
      />
    </Suspense>
  );
  const campos = Object.entries(datos).filter(
    ([key]) => !key.startsWith('__') && !MONTO_KEYS.has(key)
  );

  if (campos.length === 0 && !cotizacion.id) return null;

  return (
    <div className="quote-summary">
      <div className="quote-summary__header">
        <span className="quote-summary__label">
          COTIZACIÓN{esFormal ? ` ${cotizacion.folio}` : ''}
          {datos.prueba ? ' · PRUEBA' : ''}
        </span>
        <span className={`quote-summary__estatus quote-summary__estatus--${cotizacion.estatus}`}>
          {cotizacion.estatus}
        </span>
      </div>

      <div className="quote-summary__formal">
        {cotizaciones.length > 1 && (
          <select
            className="quote-summary__select"
            value={cotizacion.id}
            onChange={(e) => seleccionar(cotizaciones.find((c) => c.id === e.target.value) || null)}
            aria-label="Elegir cotización"
          >
            {cotizaciones.map((c) => (
              <option key={c.id} value={c.id}>
                {etiquetaCotizacion(c)}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="quote-summary__formal-btn" onClick={() => setEditorAbierto(true)}>
          {esFormal ? 'Editar / PDF' : 'Cotización formal (PDF)'}
        </button>
        <button type="button" className="quote-summary__new-btn" onClick={nuevaCotizacion} disabled={creando} title="Nueva cotización para este cliente">
          {creando ? '…' : '+ Nueva'}
        </button>
      </div>
      {esFormal && (
        <p className="quote-summary__formal-info">
          Total {formatoMonto(cotizacion.total ?? 0)}
          {cotizacion.sent_at ? ` · enviada ${new Date(cotizacion.sent_at).toLocaleDateString('es-MX')}` : ' · sin enviar'}
        </p>
      )}

      {campos.length > 0 && (
        <dl className="quote-summary__grid">
          {campos.map(([key, value]) => (
            <div key={key} className="quote-summary__field">
              <dt>{key.replace(/_/g, ' ')}</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <form className="quote-summary__edit" onSubmit={handleGuardar}>
        {esFormal ? null : (
        <label className="quote-summary__edit-label">
          Monto (MXN)
          <div className="quote-summary__monto-row">
            <span className="quote-summary__currency">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={monto}
              onChange={(e) => {
                setMonto(e.target.value);
                setSaveMsg('');
              }}
              className="quote-summary__input"
              placeholder="0.00"
            />
          </div>
          {monto !== '' && !Number.isNaN(Number(monto)) && (
            <span className="quote-summary__monto-hint">{formatoMonto(monto)}</span>
          )}
        </label>
        )}

        <fieldset className="quote-summary__estatus-group">
          <legend>Estatus</legend>
          <div className="quote-summary__estatus-options">
            {ESTATUS_OPCIONES.map((opt) => (
              <label key={opt.value} className="quote-summary__estatus-option">
                <input
                  type="radio"
                  name="estatus"
                  value={opt.value}
                  checked={estatus === opt.value}
                  onChange={() => {
                    setEstatus(opt.value);
                    setSaveMsg('');
                  }}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="quote-summary__edit-actions">
          <button type="submit" className="quote-summary__save" disabled={saving}>
            {saving ? 'Guardando…' : esFormal ? 'Guardar estatus' : 'Guardar cotización'}
          </button>
          {saveMsg && <span className="quote-summary__saved">{saveMsg}</span>}
        </div>

        {saveError && <p className="quote-summary__save-error">{saveError}</p>}
      </form>
      {editor}
    </div>
  );
}
