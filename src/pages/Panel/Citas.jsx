import { useCitas } from '../../hooks/useCitas';
import EmptyState from '../../components/EmptyState';
import './Citas.css';

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: 'var(--amber-signal)' },
  confirmada: { label: 'Confirmada', color: 'var(--teal-active)' },
  cancelada: { label: 'Cancelada', color: 'var(--red-alert)' },
  completada: { label: 'Completada', color: 'var(--slate-human)' },
};

export default function Citas() {
  const { citas, loading, error, actualizarEstado } = useCitas();

  async function handleActualizarEstado(citaId, estado) {
    const ok = await actualizarEstado(citaId, estado);
    if (!ok) {
      alert('No se pudo actualizar la cita. Intenta de nuevo.');
    }
  }

  return (
    <div className="citas-page">
      <div className="citas-page__header">
        <h1>Citas agendadas</h1>
      </div>

      {error && <p className="citas-page__error">No se pudieron cargar las citas: {error}</p>}
      {loading && <p className="citas-page__loading">Cargando…</p>}

      <div className="citas-list">
        {citas.map((cita) => {
          const fecha = new Date(cita.fecha_hora);
          const estadoInfo = ESTADOS[cita.estado] ?? ESTADOS.pendiente;

          return (
            <div key={cita.id} className="cita-card">
              <div className="cita-card__fecha">
                <span className="cita-card__dia">
                  {fecha.toLocaleDateString('es', { day: '2-digit', month: 'short' })}
                </span>
                <span className="cita-card__hora">
                  {fecha.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="cita-card__info">
                <span className="cita-card__nombre">
                  {cita.contactos?.nombre || cita.contactos?.phone_number}
                </span>
                {cita.notas && <span className="cita-card__notas">{cita.notas}</span>}
              </div>

              <span
                className="cita-card__estado"
                style={{ color: estadoInfo.color, borderColor: estadoInfo.color }}
              >
                {estadoInfo.label}
              </span>

              <div className="cita-card__acciones">
                {cita.estado === 'pendiente' && (
                  <>
                    <button
                      className="cita-card__btn cita-card__btn--confirm"
                      onClick={() => handleActualizarEstado(cita.id, 'confirmada')}
                    >
                      Confirmar
                    </button>
                    <button
                      className="cita-card__btn cita-card__btn--cancel"
                      onClick={() => handleActualizarEstado(cita.id, 'cancelada')}
                    >
                      Cancelar
                    </button>
                  </>
                )}
                {cita.estado === 'confirmada' && (
                  <button
                    className="cita-card__btn"
                    onClick={() => handleActualizarEstado(cita.id, 'completada')}
                  >
                    Marcar completada
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {!loading && citas.length === 0 && (
          <EmptyState
            icon="calendar"
            title="No hay citas agendadas todavía"
            subtitle="Las citas que confirmes con tus clientes aparecen aquí."
          />
        )}
      </div>
    </div>
  );
}
