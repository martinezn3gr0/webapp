import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

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

  return { citas, loading, error, actualizarEstado };
}
