import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useMensajes } from '../hooks/useMensajes';
import QuoteSummary from './QuoteSummary';
import EmptyState from './EmptyState';
import './ChatWindow.css';

export default function ChatWindow({ contacto }) {
  const { mensajes, loading, error } = useMensajes(contacto?.id);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [envioError, setEnvioError] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function handleEnviar(e) {
    e.preventDefault();
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    setEnvioError('');
    const { error: sendError } = await supabase.functions.invoke('send-message', {
      body: { contacto_id: contacto.id, contenido: texto.trim() },
    });
    setEnviando(false);

    if (sendError) {
      setEnvioError('No se pudo enviar el mensaje. Intenta de nuevo.');
      return;
    }
    setTexto('');
  }

  if (!contacto) {
    return (
      <div className="chat-window chat-window--empty">
        <EmptyState icon="select" title="Selecciona una conversación" subtitle="Elige un chat de la lista para ver los mensajes." />
      </div>
    );
  }

  return (
    <div className="chat-window">
      <div className="chat-window__header">
        <div>
          <h2 className="chat-window__nombre">{contacto.nombre || 'Sin nombre'}</h2>
          <span className="chat-window__phone">{contacto.phone_number}</span>
        </div>
      </div>

      <QuoteSummary contactoId={contacto.id} />

      <div className="chat-window__messages">
        {error && <p className="chat-window__error">No se pudieron cargar los mensajes: {error}</p>}
        {loading && <p className="chat-window__loading">Cargando mensajes…</p>}
        {mensajes.map((m) => (
          <div key={m.id} className={`bubble bubble--${m.sender}`}>
            <p className="bubble__text">{m.contenido}</p>
            <span className="bubble__time">
              {new Date(m.created_at).toLocaleTimeString('es', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {envioError && <p className="chat-window__error">{envioError}</p>}

      <form className="chat-window__input" onSubmit={handleEnviar}>
        <input
          type="text"
          placeholder="Escribe tu respuesta…"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={enviando}
        />
        <button type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
