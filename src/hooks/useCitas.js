import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const CDMX_TZ = 'America/Mexico_City';

/** Interpreta fecha+hora local CDMX (sin DST desde 2022 → UTC-6) y devuelve ISO UTC. */
export function cdmxLocalToIso(fecha, hora) {
  const time = hora.length === 5 ? `${hora}:00` : hora;
  return new Date(`${fecha}T${time}-06:00`).toISOString();
}

export function formatCitaFechaHora(isoString) {
  const fecha = new Date(isoString);
  return {
    dia: fecha.toLocaleDateString('es-MX', {
      timeZone: CDMX_TZ,
      day: '2-digit',
      month: 'short',
    }),
    hora: fecha.toLocaleTimeString('es-MX', {
      timeZone: CDMX_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  };
}

export function mapCitaError(error) {
  const msg = error?.message || '';
  const code = error?.code || '';

  if (
    code === '23P01' ||
    /no_solapamiento|overlap|exclusion|empalm|conflict/i.test(msg)
  ) {
    return 'Ese horario se empalma con otra cita. Elige otro horario.';
  }

  if (code === '42501' || /row-level security|rls|permission|policy/i.test(msg)) {
    return 'No tienes permiso para crear citas. Verifica que estás autenticado como agente.';
  }

  if (/foreign key|contacto/i.test(msg)) {
    return 'El contacto seleccionado no es válido.';
  }

  return msg || 'No se pudo crear la cita.';
}

export function useCitas() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCitas = useCallback(async () => {
    const { data, error: fetchError } = await supabase
      .from('citas')
      .select('*, contactos(nombre, phone_number)')
      .order('fecha_hora', { ascending: true });

    if (fetchError) {
      setError(fetchError.message);
    } else {
      setError(null);
      setCitas(data ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCitas();

    const channel = supabase
      .channel('citas-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => fetchCitas())
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [fetchCitas]);

  async function actualizarEstado(citaId, estado) {
    const { error: updateError } = await supabase.from('citas').update({ estado }).eq('id', citaId);
    if (updateError) {
      setError(updateError.message);
      return false;
    }
    return true;
  }

  async function crearCita({
    contacto_id,
    cotizacion_id = null,
    fecha,
    hora,
    duracion_min = 60,
    notas = null,
    estado = 'pendiente',
  }) {
    if (!contacto_id || !fecha || !hora) {
      return { ok: false, error: 'Completa contacto, fecha y hora.' };
    }

    const payload = {
      contacto_id,
      cotizacion_id: cotizacion_id || null,
      fecha_hora: cdmxLocalToIso(fecha, hora),
      duracion_min: Number(duracion_min) || 60,
      estado,
      notas: notas?.trim() ? notas.trim() : null,
    };

    const { data, error: insertError } = await supabase
      .from('citas')
      .insert(payload)
      .select('*, contactos(nombre, phone_number)')
      .single();

    if (insertError) {
      const mensaje = mapCitaError(insertError);
      setError(mensaje);
      return { ok: false, error: mensaje };
    }

    setError(null);
    await fetchCitas();
    return { ok: true, data };
  }

  return { citas, loading, error, actualizarEstado, crearCita, refetch: fetchCitas };
}
