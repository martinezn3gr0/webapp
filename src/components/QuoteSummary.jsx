import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import './QuoteSummary.css';

const MONTO_KEYS = new Set(['monto', 'precio']);
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

export default function QuoteSummary({ contactoId }) {
  const [cotizacion, setCotizacion] = useState(null);
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

    supabase
      .from('cotizaciones')
      .select('*')
      .eq('contacto_id', contactoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (!active) return;
        if (fetchError) {
          setError(fetchError.message);
          return;
        }
        setCotizacion(data);
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
      });

    return () => {
      active = false;
    };
  }, [contactoId]);

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

    setCotizacion(data);
    setSaveMsg('Guardado');
  }

  if (error) {
    return <p className="quote-summary__error">No se pudo cargar la cotización: {error}</p>;
  }

  if (!cotizacion) return null;

  const datos = cotizacion.datos || {};
  const campos = Object.entries(datos).filter(
    ([key]) => !key.startsWith('__') && !MONTO_KEYS.has(key)
  );

  if (campos.length === 0 && !cotizacion.id) return null;

  return (
    <div className="quote-summary">
      <div className="quote-summary__header">
        <span className="quote-summary__label">COTIZACIÓN</span>
        <span className={`quote-summary__estatus quote-summary__estatus--${cotizacion.estatus}`}>
          {cotizacion.estatus}
        </span>
      </div>

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
            {saving ? 'Guardando…' : 'Guardar cotización'}
          </button>
          {saveMsg && <span className="quote-summary__saved">{saveMsg}</span>}
        </div>

        {saveError && <p className="quote-summary__save-error">{saveError}</p>}
      </form>
    </div>
  );
}
