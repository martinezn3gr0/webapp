# Telegram webhook (@Instelecjgbot)

Edge Function: `telegram-webhook` (`verify_jwt = false`; auth = `X-Telegram-Bot-Api-Secret-Token`).

URL: `https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/telegram-webhook`

## Secrets (Supabase → Edge Functions → Secrets; never commit values)

| Secret | Notes |
|---|---|
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | Random; same value passed as `secret_token` to `setWebhook` |
| `TELEGRAM_OWNER_CHAT_ID` | Jorge's chat id for lead / cita alerts (optional if registered via `/soyjorge`) |
| `TELEGRAM_OWNER_CODE` | Code for `/soyjorge <code>` (stores the chat id in `public.app_settings`) |

## Behaviour

- Private chats only. In groups the bot ignores messages; `/cotizar` gets a link to DM the bot.
- Each chat maps to `contactos.phone_number = "tg:<chat_id>"` (no schema change to contactos).
- Same shared flow as WhatsApp (`_shared/quote-bot.js`): nombre → servicio → detalle → **teléfono**
  (typed or via «📱 Compartir mi número»), then *solo cotización* vs *agendar visita* (pending cita only).
- Owner alerts (`_shared/telegram-utils.js#notifyOwner`): new bot lead, new pending cita, messages from
  conversations already in `humano`, and web-form leads from `submit-lead`. Skipped silently if no owner chat.
- Panel replies (`send-message`) to `tg:` contacts go through Telegram.
- Commands: `/start`, `/cotizar` (start/continue a quote), `/ayuda`.

## Register webhook

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url=https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/telegram-webhook \
  -d secret_token="$TELEGRAM_WEBHOOK_SECRET" -d 'allowed_updates=["message"]'
```
