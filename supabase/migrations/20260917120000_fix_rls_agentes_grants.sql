-- Fix panel access + harden public schema
-- Applies to: contactos, mensajes, cotizaciones, citas, agentes
-- Goal:
--   1) authenticated agents can use the panel (SELECT/UPDATE)
--   2) anon has no direct data access (Edge Functions use service_role)
--   3) only rows in public.agentes count as panel users

-- ---------------------------------------------------------------------------
-- Helper: current JWT user is a registered agent
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_agente()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agentes a
    WHERE a.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_agente() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_agente() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_agente() TO service_role;

-- ---------------------------------------------------------------------------
-- Table privileges
-- ---------------------------------------------------------------------------
-- Revoke broad anon access (was allowing empty 200s / future data leaks)
REVOKE ALL ON TABLE public.contactos     FROM anon;
REVOKE ALL ON TABLE public.mensajes      FROM anon;
REVOKE ALL ON TABLE public.cotizaciones  FROM anon;
REVOKE ALL ON TABLE public.citas         FROM anon;
REVOKE ALL ON TABLE public.agentes       FROM anon;

-- Authenticated role needs table grants BEFORE RLS policies can allow rows
GRANT SELECT, INSERT, UPDATE ON TABLE public.contactos     TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.mensajes      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cotizaciones  TO authenticated;
GRANT SELECT, UPDATE         ON TABLE public.citas         TO authenticated;
GRANT SELECT                 ON TABLE public.agentes       TO authenticated;

-- service_role already bypasses RLS; keep full access for Edge Functions
GRANT ALL ON TABLE public.contactos     TO service_role;
GRANT ALL ON TABLE public.mensajes      TO service_role;
GRANT ALL ON TABLE public.cotizaciones  TO service_role;
GRANT ALL ON TABLE public.citas         TO service_role;
GRANT ALL ON TABLE public.agentes       TO service_role;

-- Sequences (if id columns use them)
DO $$
DECLARE
  seq regclass;
BEGIN
  FOREACH seq IN ARRAY ARRAY[
    'public.contactos_id_seq'::regclass,
    'public.mensajes_id_seq'::regclass,
    'public.cotizaciones_id_seq'::regclass,
    'public.citas_id_seq'::regclass
  ]
  LOOP
    BEGIN
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO authenticated', seq);
      EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %s TO service_role', seq);
    EXCEPTION WHEN undefined_table THEN
      NULL;
    END;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.contactos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensajes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agentes       ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Policies (drop + recreate for idempotency)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agentes_select_own            ON public.agentes;
DROP POLICY IF EXISTS contactos_agente_all          ON public.contactos;
DROP POLICY IF EXISTS mensajes_agente_all           ON public.mensajes;
DROP POLICY IF EXISTS cotizaciones_agente_all       ON public.cotizaciones;
DROP POLICY IF EXISTS citas_agente_select           ON public.citas;
DROP POLICY IF EXISTS citas_agente_update           ON public.citas;

-- Agents can read their own agentes row (panel gate)
CREATE POLICY agentes_select_own
  ON public.agentes
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Full panel access for registered agents
CREATE POLICY contactos_agente_all
  ON public.contactos
  FOR ALL
  TO authenticated
  USING (public.is_agente())
  WITH CHECK (public.is_agente());

CREATE POLICY mensajes_agente_all
  ON public.mensajes
  FOR ALL
  TO authenticated
  USING (public.is_agente())
  WITH CHECK (public.is_agente());

CREATE POLICY cotizaciones_agente_all
  ON public.cotizaciones
  FOR ALL
  TO authenticated
  USING (public.is_agente())
  WITH CHECK (public.is_agente());

CREATE POLICY citas_agente_select
  ON public.citas
  FOR SELECT
  TO authenticated
  USING (public.is_agente());

CREATE POLICY citas_agente_update
  ON public.citas
  FOR UPDATE
  TO authenticated
  USING (public.is_agente())
  WITH CHECK (public.is_agente());

-- ---------------------------------------------------------------------------
-- Realtime: ensure tables are in publication (ignore if already added)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contactos;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mensajes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.citas;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
