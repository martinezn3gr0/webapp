import { useEffect, useRef, useState } from 'react';
import './Landing.css';

const WHATSAPP_NUMBER = '525658105587';
const WHATSAPP_DISPLAY = '56 5810 5587';

const NAV_LINKS = [
  { href: '#servicios', label: 'Servicios' },
  { href: '#proceso', label: 'Cómo funciona' },
  { href: '#trabajos', label: 'Trabajos' },
  { href: '#contacto', label: 'Contacto' },
];

const SERVICIOS = [
  {
    icon: 'home',
    title: 'Instalación eléctrica residencial',
    desc: 'Circuitos, contactos y apagadores en casa habitación. Incluye material y mano de obra.',
    price: '$3,000 – $8,000 / hab.',
    wide: true,
  },
  {
    icon: 'store',
    title: 'Comercial',
    desc: 'Negocios, oficinas y locales comerciales.',
    price: 'Por proyecto',
  },
  {
    icon: 'verified',
    title: 'Mantenimiento',
    desc: 'Revisión general y detección temprana.',
    price: '$1,500 – $3,500',
  },
  {
    icon: 'bolt',
    title: 'Cortocircuitos',
    desc: 'Diagnóstico y reparación de fallas críticas.',
    price: '$400 – $1,200',
  },
  {
    icon: 'tools',
    title: 'Cambio de instalación antigua',
    desc: 'Renovación de instalaciones con más de 15-20 años o cableado en riesgo.',
    price: 'Desde $3,000 / hab.',
    wide: true,
  },
  {
    icon: 'grid',
    title: 'Tableros',
    desc: 'Instalación de centros de carga.',
    price: '$1,800 – $3,500',
  },
];

const PROCESO = [
  {
    num: '01',
    title: 'Escribes por WhatsApp',
    desc: 'Cuéntame qué necesitas y en qué zona estás. Respondo directo, sin intermediarios.',
  },
  {
    num: '02',
    title: 'Cotización sin costo',
    desc: 'Te doy un diagnóstico inicial y un rango de precio antes de visitar el lugar.',
  },
  {
    num: '03',
    title: 'Se hace el trabajo',
    desc: 'Visito, confirmo el alcance final y realizo la instalación o reparación.',
  },
];

const TRABAJOS = [
  {
    src: '/portfolio/tableros-cableado-organizado.jpg',
    label: 'Tableros trifásicos — Cableado',
    alt: 'Dos tableros eléctricos abiertos con cableado organizado y codificado por colores',
  },
  {
    src: '/portfolio/tablero-medidor-interior.jpg',
    label: 'Tablero y medidor — Interior',
    alt: 'Instalación interior de medidor eléctrico y centro de carga con circuitos etiquetados',
  },
  {
    src: '/portfolio/tablero-medidor-empotrado.jpg',
    label: 'Medidor empotrado — Residencial',
    alt: 'Medidor eléctrico empotrado en muro con conexiones y cableado limpio',
  },
  {
    src: '/portfolio/tablero-electrico-exterior.jpg',
    label: 'Centro de carga — Exterior',
    alt: 'Centro de carga eléctrico instalado en muro exterior de concreto',
  },
  {
    src: '/portfolio/medidores-electricos-fachada.jpg',
    label: 'Medidores CFE — Multifamiliar',
    alt: 'Tres medidores eléctricos instalados en fachada de edificio multifamiliar',
  },
];

function Icon({ name, size = 24 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
  switch (name) {
    case 'home':
      return (
        <svg {...common}>
          <path d="M3 11.5 12 4l9 7.5" />
          <path d="M5.5 10v9a1 1 0 0 0 1 1H9v-5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1V20h2.5a1 1 0 0 0 1-1v-9" />
        </svg>
      );
    case 'store':
      return (
        <svg {...common}>
          <path d="M4 9.5 5 4h14l1 5.5" />
          <path d="M4.5 9.5v9a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9" />
          <path d="M4 9.5a2.3 2.3 0 0 0 4.4 1 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4 0 2.3 2.3 0 0 0 4.4-1" />
        </svg>
      );
    case 'verified':
      return (
        <svg {...common}>
          <path d="m9 12 2 2 4-4" />
          <path d="M12 3.5 14.4 5l3.1-.2.8 3 2.2 2.2-1.4 2.8 1.4 2.8-2.2 2.2-.8 3-3.1-.2L12 22.5 9.6 21l-3.1.2-.8-3-2.2-2.2 1.4-2.8-1.4-2.8L5.7 7.8l.8-3L9.6 5Z" />
        </svg>
      );
    case 'bolt':
      return (
        <svg {...common}>
          <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
        </svg>
      );
    case 'tools':
      return (
        <svg {...common}>
          <path d="M14.5 6.5 17 4a4 4 0 0 1 4 4l-2.5 2.5" />
          <path d="m14 8-9.5 9.5a1.7 1.7 0 0 0 2.4 2.4L16.5 10" />
          <path d="M9.5 6.5 7 9" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" />
          <rect x="4" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
        </svg>
      );
    case 'call':
      return (
        <svg {...common}>
          <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" />
        </svg>
      );
    case 'photo':
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10.5" r="1.8" />
          <path d="m4 18 5.5-5.5a2 2 0 0 1 2.8 0L18 18" />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm5.8 14.14c-.24.68-1.4 1.3-1.93 1.38-.5.08-1.12.11-1.81-.11a16.6 16.6 0 0 1-1.65-.61c-2.9-1.25-4.79-4.17-4.93-4.36-.14-.19-1.18-1.57-1.18-3 0-1.42.75-2.12 1.01-2.41.27-.29.58-.36.78-.36.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.15.12.32.02.51-.1.19-.15.31-.29.48-.15.17-.31.38-.44.51-.15.15-.3.31-.13.6.17.29.76 1.25 1.63 2.02 1.12 1 2.06 1.31 2.35 1.46.29.15.46.13.63-.08.17-.21.72-.84.91-1.13.19-.29.38-.24.63-.14.26.1 1.65.78 1.93.92.29.14.48.21.55.33.07.12.07.68-.17 1.36z" />
        </svg>
      );
    default:
      return null;
  }
}

function Reveal({ children, as: Tag = 'div', className = '', ...rest }) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(true);
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`landing__reveal ${active ? 'landing__reveal--active' : ''} ${className}`}
      {...rest}
    >
      {children}
    </Tag>
  );
}

function buildWhatsAppUrl({ nombre, telefono, servicio, urgencia, descripcion }) {
  const urgenciaTexto = urgencia === 'si' ? 'SÍ, es urgente' : 'No es urgente';
  const msg = [
    'Hola, quiero una cotización.',
    `Nombre: ${nombre}`,
    `Teléfono: ${telefono}`,
    `Servicio: ${servicio}`,
    `¿Urgente?: ${urgenciaTexto}`,
    `Descripción: ${descripcion}`,
  ].join('\n');
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
}

export default function Landing() {
  const [form, setForm] = useState({
    nombre: '',
    telefono: '',
    servicio: '',
    urgencia: 'no',
    descripcion: '',
  });

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    window.open(buildWhatsAppUrl(form), '_blank', 'noopener');
  }

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="landing-header__inner">
          <a className="landing-header__brand" href="#top">
            <span className="landing-header__mark" aria-hidden="true">
              <span />
            </span>
            Instalaciones Eléctricas J-G
          </a>
          <nav className="landing-header__nav">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
          </nav>
          <a
            className="landing-btn landing-btn--primary landing-btn--sm landing-header__cta"
            href={`https://wa.me/${WHATSAPP_NUMBER}`}
            target="_blank"
            rel="noreferrer"
          >
            WhatsApp
          </a>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="landing-hero__inner">
            <Reveal>
              <div className="landing__eyebrow">CDMX · Estado de México · Servicio a domicilio</div>
              <h1 className="landing-hero__title">
                La instalación se hace <em>una vez</em>.
                <br />
                Que quede bien.
              </h1>
              <p className="landing-hero__lead">
                Técnico electricista con 9 años de experiencia en instalaciones residenciales,
                comerciales e industriales. Desde un cambio de pastillas hasta tableros trifásicos.
              </p>
              <div className="landing-hero__ctas">
                <a
                  className="landing-btn landing-btn--primary"
                  href={`https://wa.me/${WHATSAPP_NUMBER}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cotizar por WhatsApp
                </a>
                <a className="landing-btn landing-btn--ghost" href="#servicios">
                  Ver servicios
                </a>
              </div>
              <div className="landing-hero__stats">
                <div>
                  <div className="landing-hero__stat-num">9+</div>
                  <div className="landing-hero__stat-label">Años de experiencia</div>
                </div>
                <div className="landing-hero__stat-divider" />
                <div>
                  <div className="landing-hero__stat-num">100%</div>
                  <div className="landing-hero__stat-label">Sin costo inicial</div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="landing-panel">
                <div className="landing-panel__head">
                  <span className="landing-panel__head-label">Panel — Centro de Carga v2.0</span>
                  <span className="landing-panel__status">
                    <span className="landing-panel__status-dot" />
                    Sistema activo
                  </span>
                </div>
                <div className="landing-panel__grid">
                  {[
                    { label: 'Instalación\nResidencial', meta: 'MOD-001 / LOAD: 85%', on: true },
                    { label: 'Mantenimiento\nPreventivo', meta: 'MOD-002 / STATUS: OK', on: true },
                    { label: 'Reparación\nUrgente', meta: 'MOD-003 / STANDBY', on: false },
                    { label: 'Proyectos\nTrifásicos', meta: 'MOD-004 / LOAD: 0%', on: true },
                  ].map((mod) => (
                    <div className="landing-panel__module" key={mod.label}>
                      <div className="landing-panel__module-row">
                        <span className="landing-panel__module-label">
                          {mod.label.split('\n').map((line, i) => (
                            <span key={i}>
                              {line}
                              <br />
                            </span>
                          ))}
                        </span>
                        <span
                          className={`landing-panel__toggle ${mod.on ? 'landing-panel__toggle--on' : ''}`}
                        >
                          <span className="landing-panel__toggle-thumb" />
                        </span>
                      </div>
                      <span className="landing-panel__module-meta">{mod.meta}</span>
                    </div>
                  ))}
                </div>
                <div className="landing-panel__footer">
                  <div className="landing-panel__bars">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="landing-panel__footer-label">COTIZANDO EN TIEMPO REAL...</span>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="landing__section landing-services" id="servicios">
          <Reveal className="landing-services__intro">
            <div className="landing__eyebrow">Servicios especializados</div>
            <h2 className="landing__heading">
              Seis circuitos de trabajo,
              <br />
              un solo estándar de calidad.
            </h2>
            <p className="landing__subhead">
              Precios de referencia — el costo final depende de materiales y condiciones del lugar.
              Cotización exacta sin costo por WhatsApp.
            </p>
          </Reveal>
          <div className="landing-services__grid">
            {SERVICIOS.map((s) => (
              <Reveal
                key={s.title}
                className={`landing-service-card ${s.wide ? 'landing-service-card--wide' : ''}`}
              >
                <div>
                  <div className="landing-service-card__icon">
                    <Icon name={s.icon} size={26} />
                  </div>
                  <h3 className="landing-service-card__title">{s.title}</h3>
                  <p className="landing-service-card__desc">{s.desc}</p>
                </div>
                <div className="landing-service-card__price">{s.price}</div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="landing-process" id="proceso">
          <div className="landing__section">
            <Reveal className="landing-process__title">
              <h2 className="landing__heading">De tu mensaje al trabajo terminado</h2>
            </Reveal>
            <div className="landing-process__grid">
              {PROCESO.map((step) => (
                <Reveal className="landing-process__step" key={step.num}>
                  <div className="landing-process__num">{step.num}</div>
                  <h3>{step.title}</h3>
                  <p>{step.desc}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="landing__section" id="trabajos">
          <div className="landing-portfolio__head">
            <Reveal as="div">
              <h2 className="landing__heading" style={{ marginBottom: 8 }}>
                Trabajos realizados
              </h2>
              <p className="landing__subhead">Resultados reales en residencias y comercios de la ciudad.</p>
            </Reveal>
            <span className="landing-portfolio__updated">Actualizado: semana actual</span>
          </div>
          <div className="landing-portfolio__grid">
            {TRABAJOS.map((trabajo) => (
              <Reveal className="landing-portfolio__item" key={trabajo.src}>
                <img
                  className="landing-portfolio__item-img"
                  src={trabajo.src}
                  alt={trabajo.alt}
                  loading="lazy"
                />
                <span className="landing-portfolio__item-label">{trabajo.label}</span>
              </Reveal>
            ))}
          </div>
          <Reveal className="landing-portfolio__quote">
            <p>
              "Trabajos residenciales, comerciales e industriales — desde un cambio de pastillas hasta
              tableros trifásicos completos."
            </p>
            <span>9 años de experiencia en campo</span>
          </Reveal>
        </section>

        <section className="landing__section landing-contact" id="contacto">
          <div className="landing-contact__grid">
            <Reveal>
              <h2 className="landing__heading">Hablemos de tu proyecto</h2>
              <p className="landing-contact__lead">
                Respuesta inmediata por WhatsApp. Atiendo emergencias y proyectos programados.
              </p>
              <div className="landing-contact__item">
                <span className="landing-contact__icon">
                  <Icon name="call" />
                </span>
                <div>
                  <div className="landing-contact__label">WhatsApp directo</div>
                  <a
                    className="landing-contact__value"
                    href={`https://wa.me/${WHATSAPP_NUMBER}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {WHATSAPP_DISPLAY}
                  </a>
                </div>
              </div>
              <div className="landing-contact__item">
                <span className="landing-contact__icon">
                  <Icon name="clock" />
                </span>
                <div>
                  <div className="landing-contact__label">Horario de atención</div>
                  <div className="landing-contact__value">Lun – Sáb, 8:00 – 20:00</div>
                </div>
              </div>
            </Reveal>

            <Reveal>
              <div className="landing-form-card">
                <form className="landing-form" onSubmit={handleSubmit}>
                  <div className="landing-form__row">
                    <div className="landing-form__field">
                      <label htmlFor="nombre">Nombre</label>
                      <input
                        id="nombre"
                        type="text"
                        required
                        value={form.nombre}
                        onChange={(e) => updateField('nombre', e.target.value)}
                      />
                    </div>
                    <div className="landing-form__field">
                      <label htmlFor="telefono">Teléfono</label>
                      <input
                        id="telefono"
                        type="tel"
                        required
                        value={form.telefono}
                        onChange={(e) => updateField('telefono', e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="landing-form__field">
                    <label htmlFor="servicio">Tipo de servicio</label>
                    <select
                      id="servicio"
                      required
                      value={form.servicio}
                      onChange={(e) => updateField('servicio', e.target.value)}
                    >
                      <option value="">Selecciona una opción</option>
                      <option value="Instalación residencial">Instalación residencial</option>
                      <option value="Instalación comercial">Instalación comercial</option>
                      <option value="Mantenimiento preventivo">Mantenimiento preventivo</option>
                      <option value="Reparación de fallas">Reparación de fallas</option>
                      <option value="Cambio de instalación antigua">Cambio de instalación antigua</option>
                      <option value="Centro de carga / pastillas">Centro de carga / pastillas</option>
                      <option value="Luminarias LED">Luminarias LED</option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>

                  <div className="landing-form__field">
                    <label>¿Es una emergencia?</label>
                    <div className="landing-form__urgencia">
                      <div
                        role="button"
                        tabIndex={0}
                        className={`landing-form__urgencia-option landing-form__urgencia-option--urgente ${
                          form.urgencia === 'si' ? 'landing-form__urgencia-option--active' : ''
                        }`}
                        onClick={() => updateField('urgencia', 'si')}
                        onKeyDown={(e) => e.key === 'Enter' && updateField('urgencia', 'si')}
                      >
                        SÍ, URGENTE
                      </div>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`landing-form__urgencia-option landing-form__urgencia-option--normal ${
                          form.urgencia === 'no' ? 'landing-form__urgencia-option--active' : ''
                        }`}
                        onClick={() => updateField('urgencia', 'no')}
                        onKeyDown={(e) => e.key === 'Enter' && updateField('urgencia', 'no')}
                      >
                        PUEDE ESPERAR
                      </div>
                    </div>
                  </div>

                  <div className="landing-form__field">
                    <label htmlFor="descripcion">Descripción del problema</label>
                    <textarea
                      id="descripcion"
                      rows={3}
                      placeholder="Ej. Se fue la luz en dos cuartos desde ayer..."
                      value={form.descripcion}
                      onChange={(e) => updateField('descripcion', e.target.value)}
                    />
                  </div>

                  <button type="submit" className="landing-btn landing-btn--primary landing-form__submit">
                    Enviar por WhatsApp
                  </button>
                </form>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <section className="landing-legal" id="privacidad">
        <div className="landing-legal__inner">
          <h2>Política de Privacidad</h2>
          <p>
            Instalaciones Eléctricas J-G, a cargo de Jorge Martinez. Contacto: instelecjg@gmail.com,
            WhatsApp {WHATSAPP_DISPLAY}. Recopilamos nombre, teléfono y descripción del servicio
            únicamente para generar cotizaciones y agendar citas. No compartimos datos con terceros.
            Almacenamos la información en Supabase de forma segura.
          </p>
          <p>
            Puedes solicitar la eliminación de tus datos escribiendo a instelecjg@gmail.com. Uso de
            WhatsApp Business API bajo las políticas de Meta.
          </p>
          <p>Última actualización: Agosto 2026. Cobertura: CDMX y Estado de México.</p>
        </div>
      </section>

      <section className="landing-legal landing-legal--alt" id="terminos">
        <div className="landing-legal__inner">
          <h2>Términos y Condiciones</h2>
          <p>
            Las cotizaciones son gratuitas y sin compromiso. Los precios pueden variar según visita
            técnica. Servicio garantizado.
          </p>
        </div>
      </section>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <div className="landing-footer__brand">
            <span className="landing-footer__mark" aria-hidden="true">
              <span />
            </span>
            Instalaciones Eléctricas J-G
          </div>
          <div className="landing-footer__copy">© 2026 — Ciudad de México / Estado de México</div>
          <div className="landing-footer__links">
            <div className="landing-footer__links-row">
              <a href="#servicios">Servicios</a>
              <a href="#privacidad">Privacidad</a>
              <a href="#terminos">Términos</a>
              <a href="#contacto">Contacto</a>
            </div>
            <div className="landing-footer__meta">
              instelecjg@gmail.com · WhatsApp {WHATSAPP_DISPLAY} · Jorge Martinez
            </div>
          </div>
        </div>
      </footer>

      <a
        className="landing-sticky-wa"
        href={`https://wa.me/${WHATSAPP_NUMBER}`}
        target="_blank"
        rel="noreferrer"
      >
        <span className="landing-sticky-wa__label">Cotizar ahora</span>
        <span className="landing-sticky-wa__button">
          <Icon name="whatsapp" />
        </span>
      </a>
    </div>
  );
}
