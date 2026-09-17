import { useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '../supabaseClient';

export function useSession() {
  const [session, setSession] = useState(null);
  const [isAgente, setIsAgente] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(
    supabaseConfigured ? null : 'La app no está configurada correctamente (faltan credenciales de Supabase).'
  );

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;

    async function resolveAgente(nextSession) {
      if (!nextSession?.user?.id) {
        if (active) {
          setIsAgente(false);
          setSession(null);
        }
        return;
      }

      const { data, error: agenteError } = await supabase
        .from('agentes')
        .select('user_id')
        .eq('user_id', nextSession.user.id)
        .maybeSingle();

      if (!active) return;

      if (agenteError) {
        setError(agenteError.message);
        setIsAgente(false);
        setSession(nextSession);
        return;
      }

      if (!data) {
        setError('Tu usuario no está registrado como agente. Pide acceso al administrador.');
        setIsAgente(false);
        setSession(nextSession);
        return;
      }

      setError(null);
      setIsAgente(true);
      setSession(nextSession);
    }

    supabase.auth.getSession().then(async ({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      await resolveAgente(data.session);
      if (active) setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      resolveAgente(newSession);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, isAgente, loading, error };
}
