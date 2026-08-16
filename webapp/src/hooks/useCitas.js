import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useCitas() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCitas = useCallback(async () => {
    const { data, error } = await supabase
      .from('citas')
      .select('*, contactos(nombre, phone_number)')
      .order('fecha_hora', { ascending: true });

    if (!error && data) setCitas(data);
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
    await supabase.from('citas').update({ estado }).eq('id', citaId);
  }

  return { citas, loading, actualizarEstado };
}
