import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

// Trae los contactos que ya pasaron al agente humano (el bot terminó su trabajo)
// y también los que siguen en proceso, para que el agente tenga contexto completo.
export function useContactos() {
  const [contactos, setContactos] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchContactos = useCallback(async () => {
    const { data, error } = await supabase
      .from('contactos')
      .select('*, mensajes(contenido, created_at, sender)')
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setContactos(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchContactos();

    const channel = supabase
      .channel('contactos-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contactos' },
        () => fetchContactos()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'mensajes' },
        () => fetchContactos()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchContactos]);

  return { contactos, loading, refetch: fetchContactos };
}
