const ESTADO_CONFIG = {
  en_proceso: { label: 'BOT', color: 'var(--teal-active)', bg: 'var(--teal-active-soft)' },
  completado: { label: 'LISTO', color: 'var(--amber-signal)', bg: 'var(--amber-signal-soft)' },
  humano: { label: 'TÚ', color: 'var(--slate-human)', bg: 'var(--slate-human-soft)' },
};

export default function EstadoBadge({ estado }) {
  const config = ESTADO_CONFIG[estado] ?? ESTADO_CONFIG.en_proceso;
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '3px 7px',
        borderRadius: '4px',
        color: config.color,
        background: config.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {config.label}
    </span>
  );
}
