import { useState } from 'react';
import { useCitas, formatCitaFechaHora } from '../../hooks/useCitas';
import EmptyState from '../../components/EmptyState';
import NuevaCitaModal from '../../components/NuevaCitaModal';
import './Citas.css';

const ESTADOS = {
  pendiente: { label: 'Pendiente', color: 'var(--amber-signal)' },
  confirmada: { label: 'Confirmada', color: 'var(--teal-active)' },
  cancelada: { label: 'Cancelada', color: 'var(--red-alert)' },
  completada: { label: 'Completada', color: 'var(--slate-human)' },
};

export default function Citas() {
  const { citas, loading, error, actualizarEstado, crearCita } = useCitas();
  const [modalOpen, setModalOpen] = useState(false);

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
        <button type="button" className="citas-page__nueva" onClick={() => setModalOpen(true)}>
          Nueva cita
        </button>
      </div>

      {error && <p className="citas-page__error">{error}</p>}
      {loading && <p className="citas-page__loading">Cargando…</p>}

      <div className="citas-list">
        {citas.map((cita) => {
          const { dia, hora } = formatCitaFechaHora(cita.fecha_hora);
          const estadoInfo = ESTADOS[cita.estado] ?? ESTADOS.pendiente;

          return (
            <div key={cita.id} className="cita-card">
              <div className="cita-card__fecha">
                <span className="cita-card__dia">{dia}</span>
                <span className="cita-card__hora">{hora}</span>
              </div>

              <div className="cita-card__info">
                <span className="cita-card__nombre">
                  {cita.contactos?.nombre || cita.contactos?.phone_number}
                </span>
                {cita.notas && <span className="cita-card__notas">{cita.notas}</span>}
                {cita.duracion_min && (
                  <span className="cita-card__meta">{cita.duracion_min} min · CDMX</span>
                )}
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
            subtitle="Crea una con «Nueva cita» para probar el flujo de confirmación."
          />
        )}
      </div>

      <NuevaCitaModal open={modalOpen} onClose={() => setModalOpen(false)} onCrear={crearCita} />
    </div>
  );
}
