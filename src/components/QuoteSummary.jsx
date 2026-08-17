import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import './QuoteSummary.css';

export default function QuoteSummary({ contactoId }) {
  const [cotizacion, setCotizacion] = useState(null);

  useEffect(() => {
    if (!contactoId) return;
    let active = true;

    supabase
      .from('cotizaciones')
      .select('*')
      .eq('contacto_id', contactoId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setCotizacion(data);
      });

    return () => {
      active = false;
    };
  }, [contactoId]);

  if (!cotizacion) return null;

  const datos = cotizacion.datos || {};
  const campos = Object.entries(datos).filter(([key]) => !key.startsWith('__'));

  if (campos.length === 0) return null;

  return (
    <div className="quote-summary">
      <div className="quote-summary__header">
        <span className="quote-summary__label">COTIZACIÓN</span>
        <span className={`quote-summary__estatus quote-summary__estatus--${cotizacion.estatus}`}>
          {cotizacion.estatus}
        </span>
      </div>
      <dl className="quote-summary__grid">
        {campos.map(([key, value]) => (
          <div key={key} className="quote-summary__field">
            <dt>{key.replace(/_/g, ' ')}</dt>
            <dd>{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
