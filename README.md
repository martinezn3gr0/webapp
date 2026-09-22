# Panel de Cotizaciones — Agente

Panel para responder chats de WhatsApp (después de que el bot recopila los datos)
y confirmar citas agendadas. Construido con React + Vite + Supabase.

## 1. Instalación local

```bash
npm install
cp .env.example .env
```

Edita `.env` y pon tu **anon key** de Supabase (la sacas en tu proyecto →
Settings → API → `anon` `public`). La URL del proyecto ya viene puesta.

```bash
npm run dev
```

Abre `http://localhost:5173`.

## 2. Crear tu usuario de agente

Ve a tu proyecto en supabase.com → **Authentication → Users → Add user**,
crea tu correo y contraseña. Con eso entras en `/login`.

## 3. Rutas de la app

| Ruta | Acceso | Qué hace |
|---|---|---|
| `/` | Público | Landing del negocio (portafolio + formulario de cotización por WhatsApp) |
| `/login` | Público | Acceso del agente |
| `/panel/chats` | Protegido | Lista de conversaciones + responder |
| `/panel/citas` | Protegido | Confirmar / cancelar citas agendadas |

## 4. Desplegar (Vercel o Netlify)

1. Sube esta carpeta a un repo de GitHub.
2. En Vercel/Netlify: "Import project" → selecciona el repo.
3. Agrega las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   en la configuración del proyecto (mismos valores que tu `.env`).
4. Deploy.

La app es una PWA — en el celular del agente puede "Agregar a pantalla de inicio"
y se comporta como app nativa.

## 5. Cómo funciona el envío de mensajes

El panel NO manda mensajes de WhatsApp directamente desde el navegador (por
seguridad, el token de WhatsApp nunca toca el cliente). Cuando escribes y das
"Enviar", se llama a la Edge Function `send-message` en Supabase, que:
1. Verifica que tengas sesión de agente válida.
2. Envía el mensaje por la API de WhatsApp.
3. Lo guarda en la tabla `mensajes`.

Esa función ya está desplegada en tu proyecto de Supabase.

## 6. Bot de WhatsApp (Meta + Twilio Sandbox)

El código de las Edge Functions vive versionado en `supabase/functions/`:

- **`whatsapp-webhook`** — recibe los mensajes entrantes de la API de Meta,
  verifica la firma (`x-hub-signature-256`), recopila los datos de cotización
  (nombre → tipo de servicio → detalle), ofrece agendar una visita y, si el
  cliente elige horario, crea una fila en `citas` con `estado: pendiente`
  (nunca `confirmada` ni montos inventados). Al terminar pasa la conversación
  a `estado_bot: humano` para que el agente confirme en el panel.
- **`twilio-whatsapp-webhook`** — mismo flujo de negocio vía **Twilio WhatsApp
  Sandbox** (firma `X-Twilio-Signature`, respuestas por REST API, opciones
  numeradas `1`/`2`/`3`). Preferido mientras Meta Business no esté verificado.
  Guía: `supabase/functions/twilio-whatsapp-webhook/README.md`.
- **`send-message`** — usada por el panel para responder (ver punto 5; aún Meta).
- Helpers compartidos en `supabase/functions/_shared/` (`slot-utils`,
  `quote-bot`, `twilio-utils`).

### Flujo del bot (resumen)

1. Tres preguntas de cotización (igual que antes).
2. Ofrece botones (o texto `1` / `2` / palabras clave):
   - Solo cotización / un asesor contacta
   - Agendar visita
3. Si agenda: propone 2–3 huecos libres según `disponibilidad` (Lun–Sáb
   08:00–20:00 CDMX) menos citas `pendiente`/`confirmada` (respeta el
   `EXCLUDE` `no_solapamiento_citas`). El cliente responde `1`/`2`/`3`.
4. Inserta `citas` en `pendiente` con nota «Solicitada por WhatsApp» y
   `cotizacion_id` cuando aplica. Avisa que un técnico confirmará.
5. `estado_bot: humano`. Si el contacto ya está en `humano`, el bot no responde.
6. En medio del flujo (`en_proceso`), las palabras `cita` / `agendar` /
   `visita` saltan a horarios (si falta el nombre, lo pide primero).

**Importante:** tras mergear cambios del webhook hay que **volver a desplegar**
las Edge Functions afectadas en Supabase (`whatsapp-webhook` y/o
`twilio-whatsapp-webhook`).

### Probar con Twilio Sandbox (recomendado ahora)

1. Secrets Twilio en Supabase (tabla abajo). No hardcodees tokens en el repo.
2. Despliega `twilio-whatsapp-webhook` (`verify_jwt` ya está en `false` en
   `supabase/config.toml`).
3. En Twilio Sandbox → «When a message comes in» → HTTP POST a:
   `https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/twilio-whatsapp-webhook`
4. Desde el celular: envía el código `join …` al número Sandbox, luego `hola`.
5. Misma checklist de flujo que abajo (cotización → 1/2 → slots → pendiente).

Detalle paso a paso: `supabase/functions/twilio-whatsapp-webhook/README.md`.

### Probar con Meta WhatsApp (cuando vuelva a estar disponible)

1. Confirma que los secrets de Meta existen en Supabase (tabla abajo).
2. Despliega `whatsapp-webhook`.
3. En Meta → WhatsApp → Configuration, el callback apunta a esa función y el
   Verify Token coincide con `META_VERIFY_TOKEN`.
4. Desde un número de prueba (no uses un contacto que ya esté en
   `estado_bot: humano`, o ponlo en `en_proceso` desde el SQL editor):
   - Completa nombre / servicio / detalle → deben aparecer los botones de
     cotización vs visita.
   - Elige «Agendar visita» → llegan 2–3 horarios → responde `1`.
   - En el panel `/panel/citas` debe verse la cita **pendiente** (sin
     confirmar sola).
   - En `/panel/chats` el contacto queda en mano del agente.
5. Prueba keywords: en mitad del cuestionario escribe `cita` → pide nombre si
   falta, luego horarios.
6. Prueba «Solo cotización» → mensaje de cierre y handoff sin crear cita.

Helpers (sin red):

```bash
node --test supabase/functions/_shared/slot-utils.test.mjs
node --test supabase/functions/_shared/twilio-utils.test.mjs
```

Secrets en Supabase (Project Settings → Edge Functions → Secrets):

| Secret | Uso |
|---|---|
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio (Sandbox) |
| `TWILIO_AUTH_TOKEN` | Auth Token (firma del webhook + envío REST) |
| `TWILIO_WHATSAPP_FROM` | Remitente Sandbox, p. ej. `whatsapp:+14155238886` |
| `TWILIO_WEBHOOK_URL` | Opcional; URL pública exacta para validar la firma |
| `WHATSAPP_TOKEN` | Token de acceso de la app de Meta para mandar mensajes |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp Business |
| `META_APP_SECRET` | App Secret de Meta, para verificar la firma del webhook |
| `META_VERIFY_TOKEN` | El mismo valor que pongas como "Verify Token" al configurar el webhook en Meta |
| `PANEL_ORIGIN` | Origen permitido por CORS para `send-message` (URL de este panel en Vercel) |

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya los inyecta Supabase
automáticamente en cada función.

Al configurar el webhook en el App Dashboard de Meta, la URL de callback es
la de la función `whatsapp-webhook` y el "Verify Token" debe ser exactamente
el mismo valor que guardes en el secret `META_VERIFY_TOKEN`.
