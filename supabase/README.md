# Supabase

## Aplicar la migración RLS (requerido)

Este Cloud Agent **no tiene** el MCP de Supabase autenticado en la sesión.
Hasta que conectes el MCP (o pegues el SQL a mano), la base en vivo no cambia.

### Opción A — SQL Editor (rápido)

1. Abre https://supabase.com/dashboard/project/fxgdalrilgrewndbrkuy/sql/new
2. Pega el contenido de `migrations/20260917120000_fix_rls_agentes_grants.sql`
3. Run

### Opción B — MCP en este agente

Acepta el popup de autenticación de Supabase cuando el agente lo pida (no lo canceles).
Después el agente puede aplicar la migración por ti.

### Tras aplicar

1. Confirma que tu usuario de panel existe en `public.agentes` (`user_id` = UUID de Auth).
2. Redeploy / refresca el secret `PANEL_ORIGIN=https://instelecjg.com` en Edge Functions si aún apunta a `*.vercel.app`.
3. Prueba login en `/login` → `/panel/chats` y `/panel/citas`.
