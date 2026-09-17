import { useState } from 'react';
import { supabase, supabaseConfigured } from '../supabaseClient';
import './LeadBot.css';

const STEPS = [
  {
    key: 'nombre',
    bot: '¡Hola! Soy el asistente de Instalaciones Eléctricas J-G. ¿Cuál es tu nombre?',
    placeholder: 'Tu nombre',
  },
  {
    key: 'servicio',
    bot: 'Gracias. ¿Qué tipo de servicio necesitas?',
    placeholder: 'Ej. cambio de pastillas, instalación…',
  },
  {
    key: 'descripcion',
    bot: 'Perfecto. Cuéntame brevemente el detalle o la falla.',
    placeholder: 'Describe el problema…',
  },
  {
    key: 'telefono',
    bot: 'Último paso: ¿a qué número de WhatsApp te contactamos?',
    placeholder: '55 1234 5678',
  },
];

const WHATSAPP_NUMBER = '525658105587';

export default function LeadBot() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    nombre: '',
    servicio: '',
    descripcion: '',
    telefono: '',
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([{ from: 'bot', text: STEPS[0].bot }]);

  async function finish(finalAnswers) {
    setBusy(true);
    setError('');
    const { data, error: fnError } = await supabase.functions.invoke('submit-lead', {
      body: {
        ...finalAnswers,
        urgencia: 'no',
        fuente: 'web_bot',
      },
    });
    setBusy(false);

    if (fnError || data?.error) {
      setError('No pude guardar tu solicitud. Intenta de nuevo o escríbenos por WhatsApp.');
      return;
    }

    setDone(true);
    setLog((prev) => [
      ...prev,
      {
        from: 'bot',
        text: 'Listo. Ya envié tus datos a un asesor. Si es urgente, también puedes escribirnos por WhatsApp.',
      },
    ]);
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!input.trim() || busy || done) return;
    if (!supabaseConfigured) {
      setError('El asistente no está configurado todavía.');
      return;
    }

    const value = input.trim();
    const current = STEPS[step];
    const nextAnswers = { ...answers, [current.key]: value };
    setAnswers(nextAnswers);
    setLog((prev) => [...prev, { from: 'user', text: value }]);
    setInput('');

    if (step < STEPS.length - 1) {
      const next = step + 1;
      setStep(next);
      setLog((prev) => [...prev, { from: 'bot', text: STEPS[next].bot }]);
      return;
    }

    await finish(nextAnswers);
  }

  return (
    <div className="lead-bot">
      {open && (
        <div className="lead-bot__panel" role="dialog" aria-label="Asistente de cotización">
          <div className="lead-bot__header">
            <div>
              <strong>Asistente J-G</strong>
              <span>Cotización automática</span>
            </div>
            <button type="button" className="lead-bot__close" onClick={() => setOpen(false)} aria-label="Cerrar">
              ×
            </button>
          </div>

          <div className="lead-bot__messages">
            {log.map((m, i) => (
              <div key={`${m.from}-${i}`} className={`lead-bot__bubble lead-bot__bubble--${m.from}`}>
                {m.text}
              </div>
            ))}
            {error && <p className="lead-bot__error">{error}</p>}
          </div>

          {!done ? (
            <form className="lead-bot__form" onSubmit={handleSend}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={STEPS[step]?.placeholder || 'Escribe…'}
                disabled={busy}
                autoComplete="off"
              />
              <button type="submit" disabled={busy || !input.trim()}>
                {busy ? '…' : 'Enviar'}
              </button>
            </form>
          ) : (
            <a
              className="lead-bot__wa"
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noreferrer"
            >
              Abrir WhatsApp
            </a>
          )}
        </div>
      )}

      <button
        type="button"
        className="lead-bot__launcher"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Cerrar' : 'Cotizar con el asistente'}
      </button>
    </div>
  );
}
