-- Cotizaciones formales: partidas, folio, totales, IVA opcional, descuento por visita,
-- envío (PDF en Storage). Migración ADITIVA: no cambia filas existentes salvo el
-- backfill de `fecha` desde created_at. Las cotizaciones "legacy" (sin folio) siguen
-- funcionando igual: el trigger de totales solo actúa cuando la cotización tiene folio.
--
-- Diseño pensado para crecer (órdenes de trabajo, cobranza, CFDI):
--   * folio_contadores es genérico por serie/año (COT, OT, REC, FAC...).
--   * Montos en numeric(12,2), moneda explícita, IVA con tasa configurable.
--   * El IVA se calcula sobre (subtotal - descuento), igual que la base de un CFDI.

-- 1) Columnas nuevas en cotizaciones -------------------------------------------------
alter table public.cotizaciones
  add column if not exists folio               text,
  add column if not exists fecha               date,
  add column if not exists vigencia_dias       integer       not null default 15,
  add column if not exists moneda              text          not null default 'MXN',
  add column if not exists subtotal            numeric(12,2) not null default 0,
  add column if not exists aplica_iva          boolean       not null default false,
  add column if not exists iva_tasa            numeric(5,4)  not null default 0.16,
  add column if not exists iva_monto           numeric(12,2) not null default 0,
  add column if not exists descuento_visita    numeric(12,2),
  add column if not exists total               numeric(12,2),
  add column if not exists condiciones         text,
  add column if not exists anticipo_porcentaje numeric(5,2),
  add column if not exists sent_at             timestamptz,
  add column if not exists pdf_path            text;

update public.cotizaciones
   set fecha = (created_at at time zone 'America/Mexico_City')::date
 where fecha is null;

alter table public.cotizaciones
  alter column fecha set default ((now() at time zone 'America/Mexico_City')::date),
  alter column fecha set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cotizaciones_folio_key') then
    alter table public.cotizaciones add constraint cotizaciones_folio_key unique (folio);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cotizaciones_montos_check') then
    alter table public.cotizaciones add constraint cotizaciones_montos_check check (
      vigencia_dias between 1 and 365
      and iva_tasa >= 0 and iva_tasa < 1
      and subtotal >= 0 and iva_monto >= 0
      and (descuento_visita is null or descuento_visita >= 0)
      and (total is null or total >= 0)
      and (anticipo_porcentaje is null or (anticipo_porcentaje > 0 and anticipo_porcentaje <= 100))
    );
  end if;
end $$;

comment on column public.cotizaciones.folio is 'Folio legible COT-AAAA-NNNN. NULL = cotización legacy/lead sin formalizar.';
comment on column public.cotizaciones.total is 'Calculado por trigger (subtotal - descuento_visita + IVA). Se copia a datos.monto por compatibilidad.';
comment on column public.cotizaciones.anticipo_porcentaje is 'Solo informativo en el PDF (ej. 50 = 50% de anticipo).';

-- 2) Partidas (conceptos) --------------------------------------------------------------
create table if not exists public.cotizacion_partidas (
  id              uuid primary key default gen_random_uuid(),
  cotizacion_id   uuid not null references public.cotizaciones(id) on delete cascade,
  orden           integer not null default 0,
  concepto        text not null check (length(btrim(concepto)) > 0),
  descripcion     text,
  cantidad        numeric(12,3) not null default 1 check (cantidad > 0),
  unidad          text not null default 'servicio',
  precio_unitario numeric(12,2) not null default 0 check (precio_unitario >= 0),
  importe         numeric(12,2) generated always as (round(cantidad * precio_unitario, 2)) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists cotizacion_partidas_cotizacion_idx
  on public.cotizacion_partidas (cotizacion_id, orden);

alter table public.cotizacion_partidas enable row level security;

drop policy if exists solo_agentes_cotizacion_partidas on public.cotizacion_partidas;
create policy solo_agentes_cotizacion_partidas on public.cotizacion_partidas
  for all to authenticated using (public.es_agente()) with check (public.es_agente());

revoke all on public.cotizacion_partidas from anon, public;
grant select, insert, update, delete on public.cotizacion_partidas to authenticated;

drop trigger if exists trg_cotizacion_partidas_updated_at on public.cotizacion_partidas;
create trigger trg_cotizacion_partidas_updated_at
  before update on public.cotizacion_partidas
  for each row execute function public.set_updated_at();

-- 3) Contadores de folio genéricos (COT, y a futuro OT/REC/FAC) -------------------------
create table if not exists public.folio_contadores (
  serie  text    not null,
  anio   integer not null,
  ultimo integer not null default 0,
  primary key (serie, anio)
);

alter table public.folio_contadores enable row level security;

drop policy if exists solo_agentes_folio_contadores on public.folio_contadores;
create policy solo_agentes_folio_contadores on public.folio_contadores
  for all to authenticated using (public.es_agente()) with check (public.es_agente());

revoke all on public.folio_contadores from anon, public;
grant select, insert, update on public.folio_contadores to authenticated;

create or replace function public.siguiente_folio(p_serie text, p_fecha date default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anio integer := extract(year from coalesce(p_fecha, (now() at time zone 'America/Mexico_City')::date))::integer;
  v_num  integer;
begin
  insert into public.folio_contadores as fc (serie, anio, ultimo)
  values (upper(p_serie), v_anio, 1)
  on conflict (serie, anio) do update set ultimo = fc.ultimo + 1
  returning fc.ultimo into v_num;
  return format('%s-%s-%s', upper(p_serie), v_anio, lpad(v_num::text, 4, '0'));
end;
$$;

revoke all on function public.siguiente_folio(text, date) from public, anon;
grant execute on function public.siguiente_folio(text, date) to authenticated;

-- 4) Totales calculados en la BD (fuente de verdad) ------------------------------------
create or replace function public.cotizaciones_calcular_totales()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_subtotal numeric(12,2);
  v_base     numeric(12,2);
begin
  -- Cotizaciones legacy (sin folio): no se tocan; el monto manual sigue en datos.monto.
  if new.folio is null then
    return new;
  end if;

  select coalesce(sum(p.importe), 0) into v_subtotal
    from public.cotizacion_partidas p
   where p.cotizacion_id = new.id;

  v_base := greatest(v_subtotal - coalesce(new.descuento_visita, 0), 0);

  new.subtotal  := v_subtotal;
  new.iva_monto := case when new.aplica_iva then round(v_base * new.iva_tasa, 2) else 0 end;
  new.total     := v_base + new.iva_monto;
  -- Compatibilidad: el panel/bot históricos leen datos.monto.
  new.datos     := coalesce(new.datos, '{}'::jsonb) || jsonb_build_object('monto', new.total);
  return new;
end;
$$;

drop trigger if exists trg_cotizaciones_totales on public.cotizaciones;
create trigger trg_cotizaciones_totales
  before insert or update on public.cotizaciones
  for each row execute function public.cotizaciones_calcular_totales();

-- Cualquier cambio en partidas fuerza el recálculo en la cotización.
create or replace function public.cotizacion_partidas_tocar_cotizacion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.cotizaciones
     set updated_at = now()
   where id = coalesce(new.cotizacion_id, old.cotizacion_id);
  if tg_op = 'UPDATE' and new.cotizacion_id is distinct from old.cotizacion_id then
    update public.cotizaciones set updated_at = now() where id = old.cotizacion_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_cotizacion_partidas_totales on public.cotizacion_partidas;
create trigger trg_cotizacion_partidas_totales
  after insert or update or delete on public.cotizacion_partidas
  for each row execute function public.cotizacion_partidas_tocar_cotizacion();

-- 5) Guardado atómico desde el panel ----------------------------------------------------
-- p_campos: { fecha, vigencia_dias, aplica_iva, iva_tasa, descuento_visita, condiciones, anticipo_porcentaje }
-- p_partidas: [{ concepto, descripcion, cantidad, unidad, precio_unitario }, ...] (reemplaza todas)
create or replace function public.guardar_cotizacion(
  p_cotizacion_id uuid,
  p_campos jsonb,
  p_partidas jsonb
)
returns public.cotizaciones
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.cotizaciones;
  v_campos jsonb := coalesce(p_campos, '{}'::jsonb);
  v_fecha date;
begin
  select * into v_row from public.cotizaciones where id = p_cotizacion_id for update;
  if not found then
    raise exception 'Cotización no encontrada o sin permiso' using errcode = 'P0002';
  end if;

  v_fecha := coalesce(nullif(v_campos->>'fecha', '')::date, v_row.fecha);

  delete from public.cotizacion_partidas where cotizacion_id = p_cotizacion_id;

  insert into public.cotizacion_partidas
    (cotizacion_id, orden, concepto, descripcion, cantidad, unidad, precio_unitario)
  select p_cotizacion_id,
         (x.ord - 1)::integer,
         btrim(x.item->>'concepto'),
         nullif(btrim(coalesce(x.item->>'descripcion', '')), ''),
         coalesce(nullif(x.item->>'cantidad', '')::numeric, 1),
         coalesce(nullif(btrim(coalesce(x.item->>'unidad', '')), ''), 'servicio'),
         coalesce(nullif(x.item->>'precio_unitario', '')::numeric, 0)
    from jsonb_array_elements(coalesce(p_partidas, '[]'::jsonb)) with ordinality as x(item, ord)
   where btrim(coalesce(x.item->>'concepto', '')) <> '';

  update public.cotizaciones c set
    folio               = coalesce(c.folio, public.siguiente_folio('COT', v_fecha)),
    fecha               = v_fecha,
    vigencia_dias       = coalesce(nullif(v_campos->>'vigencia_dias', '')::integer, c.vigencia_dias),
    aplica_iva          = coalesce((v_campos->>'aplica_iva')::boolean, c.aplica_iva),
    iva_tasa            = coalesce(nullif(v_campos->>'iva_tasa', '')::numeric, c.iva_tasa),
    descuento_visita    = case when v_campos ? 'descuento_visita'
                               then nullif(nullif(v_campos->>'descuento_visita', '')::numeric, 0)
                               else c.descuento_visita end,
    condiciones         = case when v_campos ? 'condiciones'
                               then nullif(btrim(coalesce(v_campos->>'condiciones', '')), '')
                               else c.condiciones end,
    anticipo_porcentaje = case when v_campos ? 'anticipo_porcentaje'
                               then nullif(nullif(v_campos->>'anticipo_porcentaje', '')::numeric, 0)
                               else c.anticipo_porcentaje end
   where c.id = p_cotizacion_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.guardar_cotizacion(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.guardar_cotizacion(uuid, jsonb, jsonb) to authenticated;

-- 6) Bucket privado para los PDFs --------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cotizaciones-pdf', 'cotizaciones-pdf', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists agentes_cotizaciones_pdf_select on storage.objects;
create policy agentes_cotizaciones_pdf_select on storage.objects
  for select to authenticated
  using (bucket_id = 'cotizaciones-pdf' and public.es_agente());

drop policy if exists agentes_cotizaciones_pdf_insert on storage.objects;
create policy agentes_cotizaciones_pdf_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'cotizaciones-pdf' and public.es_agente());

drop policy if exists agentes_cotizaciones_pdf_update on storage.objects;
create policy agentes_cotizaciones_pdf_update on storage.objects
  for update to authenticated
  using (bucket_id = 'cotizaciones-pdf' and public.es_agente())
  with check (bucket_id = 'cotizaciones-pdf' and public.es_agente());

drop policy if exists agentes_cotizaciones_pdf_delete on storage.objects;
create policy agentes_cotizaciones_pdf_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'cotizaciones-pdf' and public.es_agente());
