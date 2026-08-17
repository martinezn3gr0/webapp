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
| `/` | Público | Landing (portafolio — pendiente) |
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
