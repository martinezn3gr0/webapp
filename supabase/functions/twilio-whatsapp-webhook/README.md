# Twilio WhatsApp Sandbox webhook

Edge Function: `twilio-whatsapp-webhook`

Public URL (configure exactly — used for `X-Twilio-Signature` validation):

```
https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/twilio-whatsapp-webhook
```

Override with secret `TWILIO_WEBHOOK_URL` if the URL ever changes.

## 1. Supabase secrets

In Supabase → Project Settings → Edge Functions → Secrets (do **not** commit real values):

| Secret | Example / notes |
|---|---|
| `TWILIO_ACCOUNT_SID` | `ACxxxxxxxx` from Twilio Console |
| `TWILIO_AUTH_TOKEN` | Auth Token (same token used to validate webhook signatures) |
| `TWILIO_WHATSAPP_FROM` | Sandbox sender, usually `whatsapp:+14155238886` |
| `TWILIO_WEBHOOK_URL` | Optional. Defaults to the URL above |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

CLI example (replace placeholders):

```bash
supabase secrets set \
  TWILIO_ACCOUNT_SID=ACxxxx \
  TWILIO_AUTH_TOKEN=your_auth_token \
  TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

## 2. Deploy

```bash
supabase functions deploy twilio-whatsapp-webhook --no-verify-jwt
```

`verify_jwt` is also set to `false` in `supabase/config.toml` so Twilio can POST without a Supabase JWT.

## 3. Twilio Sandbox webhook

1. Open [Twilio Console → Messaging → Try it out → Send a WhatsApp message](https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn) (Sandbox).
2. Under **Sandbox configuration** / **When a message comes in**:
   - URL: `https://fxgdalrilgrewndbrkuy.supabase.co/functions/v1/twilio-whatsapp-webhook`
   - Method: **HTTP POST**
3. Save.

## 4. Join the sandbox from a phone

1. In the Twilio Sandbox page, copy the join code (e.g. `join <word-word>`).
2. From your personal WhatsApp, send that text to the Sandbox number (`+1 415 523 8886`).
3. Twilio confirms you joined. Then send any message (e.g. `hola`) — the bot should ask for your name and run the same cotización → oferta cita → slots → `pendiente` flow as Meta.

## 5. Behaviour notes

- Replies use the Twilio REST Messages API (not Meta Cloud API).
- Sandbox does not support Meta-style interactive reply buttons the same way; the bot uses **plain text with numbered options** (`1` / `2` / `3`).
- Existing tables: `contactos`, `mensajes`, `cotizaciones`, `citas` (same schema as `whatsapp-webhook`).
- The Meta function `whatsapp-webhook` remains deployed for a possible future Meta path.
- Do **not** change the public landing WhatsApp link until you have a production WhatsApp sender (Sandbox needs a join code).
