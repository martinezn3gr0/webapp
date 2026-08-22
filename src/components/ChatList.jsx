import EstadoBadge from './EstadoBadge';
import EmptyState from './EmptyState';
import './ChatList.css';

function ultimoMensaje(contacto) {
  const msgs = contacto.mensajes || [];
  if (msgs.length === 0) return 'Sin mensajes aún';
  const last = [...msgs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const prefix = last.sender === 'cliente' ? '' : last.sender === 'bot' ? '🤖 ' : '👤 ';
  return prefix + last.contenido;
}

export default function ChatList({ contactos, selectedId, onSelect }) {
  return (
    <div className="chat-list">
      <div className="chat-list__header">
        <span className="chat-list__title">CHATS</span>
        <span className="chat-list__count">{contactos.length}</span>
      </div>

      <div className="chat-list__items">
        {contactos.map((c) => (
          <button
            key={c.id}
            className={`chat-stub ${selectedId === c.id ? 'chat-stub--active' : ''}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="chat-stub__notch" aria-hidden="true" />
            <div className="chat-stub__body">
              <div className="chat-stub__row">
                <span className="chat-stub__nombre">{c.nombre || c.phone_number}</span>
                <EstadoBadge estado={c.estado_bot} />
              </div>
              <p className="chat-stub__preview">{ultimoMensaje(c)}</p>
            </div>
          </button>
        ))}

        {contactos.length === 0 && (
          <EmptyState
            icon="chat"
            title="Todavía no hay conversaciones"
            subtitle="Cuando un cliente escriba por WhatsApp, aparece aquí."
          />
        )}
      </div>
    </div>
  );
}
