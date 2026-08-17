import { useState, useMemo } from 'react';
import { useContactos } from '../../hooks/useContactos';
import ChatList from '../../components/ChatList';
import ChatWindow from '../../components/ChatWindow';
import './Chats.css';

export default function Chats() {
  const { contactos, loading } = useContactos();
  const [selectedId, setSelectedId] = useState(null);

  const selectedContacto = useMemo(
    () => contactos.find((c) => c.id === selectedId) || null,
    [contactos, selectedId]
  );

  // En mobile: mostrar lista O chat, no ambos a la vez
  const showList = !selectedId;

  return (
    <div className="chats-page">
      <div className={`chats-page__list ${showList ? '' : 'chats-page__list--hidden-mobile'}`}>
        {loading ? (
          <p style={{ padding: 16, color: 'var(--ink-soft)' }}>Cargando…</p>
        ) : (
          <ChatList contactos={contactos} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </div>

      <div className={`chats-page__window ${showList ? 'chats-page__window--hidden-mobile' : ''}`}>
        {selectedId && (
          <button className="chats-page__back" onClick={() => setSelectedId(null)}>
            ← Volver
          </button>
        )}
        <ChatWindow contacto={selectedContacto} />
      </div>
    </div>
  );
}
