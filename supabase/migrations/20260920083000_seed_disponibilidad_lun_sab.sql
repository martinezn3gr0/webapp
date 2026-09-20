-- Seed business hours if disponibilidad is empty.
-- Lun–Sáb (1–6 in Postgres EXTRACT(DOW): Sunday=0 … Saturday=6) → use 1..6
-- 08:00–20:00 CDMX wall clock stored as time-of-day, 60-min slots.

INSERT INTO public.disponibilidad (dia_semana, hora_inicio, hora_fin, duracion_slot_min, activo)
SELECT d.dia, TIME '08:00', TIME '20:00', 60, true
FROM (VALUES (1), (2), (3), (4), (5), (6)) AS d(dia)
WHERE NOT EXISTS (SELECT 1 FROM public.disponibilidad LIMIT 1);
