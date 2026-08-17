import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

export function useMensajes(contactoId) {
  const [mensajes, setMensajes] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchMensajes = useCallback(async () => {
    if (!contactoId) return;
    const { data, error } = await supabase
      .from('mensajes')
      .select('*')
      .eq('contacto_id', contactoId)
      .order('created_at', { ascending: true });

    if (!error && data) setMensajes(data);
    setLoading(false);
  }, [contactoId]);

  useEffect(() => {
    if (!contactoId) return;
    setLoading(true);
    fetchMensajes();

    const channel = supabase
      .channel(`mensajes-${contactoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'mensajes',
          filter: `contacto_id=eq.${contactoId}`,
        },
        (payload) => {
          setMensajes((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [contactoId, fetchMensajes]);

  return { mensajes, loading };
}
