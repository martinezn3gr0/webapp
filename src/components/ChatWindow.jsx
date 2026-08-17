import { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useMensajes } from '../hooks/useMensajes';
import QuoteSummary from './QuoteSummary';
import './ChatWindow.css';

export default function ChatWindow({ contacto }) {
  const { mensajes, loading } = useMensajes(contacto?.id);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes]);

  async function handleEnviar(e) {
    e.preventDefault();
    if (!texto.trim() || enviando) return;

    setEnviando(true);
    const { error } = await supabase.functions.invoke('send-message', {
      body: { contacto_id: contacto.id, contenido: texto.trim() },
    });
    setEnviando(false);

    if (error) {
      alert('No se pudo enviar el mensaje. Intenta de nuevo.');
      return;
    }
    setTexto('');
  }

  if (!contacto) {
    return (
      <div className="chat-window chat-window--empty">
        <p>Selecciona una conversación de la lista.</p>
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
