-- Applied remotely via Supabase MCP on 2026-09-17
-- Allow panel users to read their own agentes row (policy agentes_self_read already exists)
GRANT SELECT ON TABLE public.agentes TO authenticated;

-- Defense in depth: anon should not have table grants where there is no intentional public read.
REVOKE ALL ON TABLE public.contactos FROM anon;
REVOKE ALL ON TABLE public.mensajes FROM anon;
REVOKE ALL ON TABLE public.cotizaciones FROM anon;

-- Tighten authenticated privileges
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.contactos FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.mensajes FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.cotizaciones FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.citas FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.disponibilidad FROM authenticated;
