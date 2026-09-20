import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import './NuevaCitaModal.css';

const emptyForm = {
  contacto_id: '',
  cotizacion_id: '',
  fecha: '',
  hora: '',
  duracion_min: 60,
  notas: '',
  confirmar: false,
};

export default function NuevaCitaModal({ open, onClose, onCrear }) {
  const [form, setForm] = useState(emptyForm);
  const [contactos, setContactos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loadingContactos, setLoadingContactos] = useState(false);
  const [loadingCots, setLoadingCots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm);
    setBusqueda('');
    setCotizaciones([]);
    setFormError('');
    setLoadingContactos(true);

    supabase
      .from('contactos')
      .select('id, nombre, phone_number')
      .order('nombre', { ascending: true })
      .then(({ data, error }) => {
        setLoadingContactos(false);
        if (error) {
          setFormError('No se pudieron cargar los contactos.');
          return;
        }
        setContactos(data ?? []);
      });
  }, [open]);

  useEffect(() => {
    if (!form.contacto_id) {
      setCotizaciones([]);
      return;
    }

    setLoadingCots(true);
    setForm((prev) => ({ ...prev, cotizacion_id: '' }));

    supabase
      .from('cotizaciones')
      .select('id, estatus, datos, created_at')
      .eq('contacto_id', form.contacto_id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        setLoadingCots(false);
        if (error) {
          setCotizaciones([]);
          return;
        }
        setCotizaciones(data ?? []);
      });
  }, [form.contacto_id]);

  const contactosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return contactos;
    return contactos.filter((c) => {
      const nombre = (c.nombre || '').toLowerCase();
      const phone = (c.phone_number || '').toLowerCase();
      return nombre.includes(q) || phone.includes(q);
    });
  }, [contactos, busqueda]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

    if (!form.contacto_id) {
      setFormError('Selecciona un contacto.');
      return;
    }
    if (!form.fecha || !form.hora) {
      setFormError('Indica fecha y hora (horario de CDMX).');
      return;
    }

    setSubmitting(true);
    const result = await onCrear({
      contacto_id: form.contacto_id,
      cotizacion_id: form.cotizacion_id || null,
      fecha: form.fecha,
      hora: form.hora,
      duracion_min: Number(form.duracion_min) || 60,
      notas: form.notas,
      estado: form.confirmar ? 'confirmada' : 'pendiente',
    });
    setSubmitting(false);

    if (!result?.ok) {
      setFormError(result?.error || 'No se pudo crear la cita.');
      return;
    }

    onClose();
  }

  if (!open) return null;

  return (
    <div className="nueva-cita-overlay" role="presentation" onClick={onClose}>
      <div
        className="nueva-cita-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nueva-cita-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nueva-cita-modal__header">
          <h2 id="nueva-cita-title">Nueva cita</h2>
          <button type="button" className="nueva-cita-modal__close" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </div>

        <form className="nueva-cita-form" onSubmit={handleSubmit}>
          <label className="nueva-cita-form__label">
            Buscar contacto
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre o teléfono…"
              className="nueva-cita-form__input"
              autoComplete="off"
            />
          </label>

          <label className="nueva-cita-form__label">
            Contacto *
            <select
              value={form.contacto_id}
              onChange={(e) => updateField('contacto_id', e.target.value)}
              className="nueva-cita-form__input"
              required
              disabled={loadingContactos}
            >
              <option value="">
                {loadingContactos ? 'Cargando…' : 'Selecciona un contacto'}
              </option>
              {contactosFiltrados.map((c) => (
                <option key={c.id} value={c.id}>
                  {(c.nombre || 'Sin nombre') + ' · ' + c.phone_number}
                </option>
              ))}
            </select>
          </label>

          <label className="nueva-cita-form__label">
            Cotización (opcional)
            <select
              value={form.cotizacion_id}
              onChange={(e) => updateField('cotizacion_id', e.target.value)}
              className="nueva-cita-form__input"
              disabled={!form.contacto_id || loadingCots}
            >
              <option value="">
                {!form.contacto_id
                  ? 'Elige un contacto primero'
                  : loadingCots
                    ? 'Cargando…'
                    : cotizaciones.length === 0
                      ? 'Sin cotizaciones'
                      : 'Sin vincular'}
              </option>
              {cotizaciones.map((cot) => {
                const servicio =
                  cot.datos?.tipo_servicio || cot.datos?.servicio || 'Cotización';
                const fecha = new Date(cot.created_at).toLocaleDateString('es-MX', {
                  timeZone: 'America/Mexico_City',
                  day: '2-digit',
                  month: 'short',
                });
                return (
                  <option key={cot.id} value={cot.id}>
                    {servicio} · {cot.estatus} · {fecha}
                  </option>
                );
              })}
            </select>
          </label>

          <div className="nueva-cita-form__row">
            <label className="nueva-cita-form__label">
              Fecha (CDMX) *
              <input
                type="date"
                value={form.fecha}
                onChange={(e) => updateField('fecha', e.target.value)}
                className="nueva-cita-form__input"
                required
              />
            </label>
            <label className="nueva-cita-form__label">
              Hora (CDMX) *
              <input
                type="time"
                value={form.hora}
                onChange={(e) => updateField('hora', e.target.value)}
                className="nueva-cita-form__input"
                required
              />
            </label>
          </div>

          <label className="nueva-cita-form__label">
            Duración (minutos)
            <input
              type="number"
              min={15}
              step={15}
              value={form.duracion_min}
              onChange={(e) => updateField('duracion_min', e.target.value)}
              className="nueva-cita-form__input"
            />
          </label>

          <label className="nueva-cita-form__label">
            Notas
            <textarea
              value={form.notas}
              onChange={(e) => updateField('notas', e.target.value)}
              className="nueva-cita-form__input nueva-cita-form__textarea"
              rows={3}
              placeholder="Dirección, acceso, detalles…"
            />
          </label>

          <label className="nueva-cita-form__check">
            <input
              type="checkbox"
              checked={form.confirmar}
              onChange={(e) => updateField('confirmar', e.target.checked)}
            />
            Crear ya como confirmada
          </label>

          {formError && <p className="nueva-cita-form__error">{formError}</p>}

          <div className="nueva-cita-form__actions">
            <button type="button" className="nueva-cita-form__btn" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button
              type="submit"
              className="nueva-cita-form__btn nueva-cita-form__btn--primary"
              disabled={submitting}
            >
              {submitting ? 'Guardando…' : 'Crear cita'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
