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

## 6. Bot de WhatsApp (Meta)

El código de las dos Edge Functions vive versionado en `supabase/functions/`:

- **`whatsapp-webhook`** — recibe los mensajes entrantes de la API de Meta,
  verifica la firma (`x-hub-signature-256`) y hace las 3 preguntas iniciales
  del bot antes de pasar la conversación a `estado_bot: humano`.
- **`send-message`** — usada por el panel para responder (ver punto 5).

Secrets que deben existir en Supabase (Project Settings → Edge Functions →
Secrets) antes de conectar Meta:

| Secret | Uso |
|---|---|
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
