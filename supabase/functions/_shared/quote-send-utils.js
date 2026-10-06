/**
 * Helpers para enviar el PDF de una cotización formal desde `send-message`.
 * Puros (sin red) para poder probarlos con `node --test`.
 */

export const QUOTE_PDF_BUCKET = "cotizaciones-pdf";
/** Vigencia del enlace firmado que recibe el cliente: 30 días. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
/** Telegram limita los captions de documentos a 1024 caracteres. */
export const TELEGRAM_CAPTION_MAX = 1024;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Valida el documento que manda el panel. El PDF debe vivir en
 * `cotizaciones-pdf/<cotizacion_id>/<archivo>.pdf` para que nadie pueda pedir
 * que se envíe un archivo ajeno.
 * @returns {{ ok: true, path: string, filename: string } | { ok: false, error: string }}
 */
export function validarDocumentoCotizacion(documento, cotizacionId) {
  if (!documento || typeof documento !== "object") return { ok: false, error: "Falta documento" };
  if (!UUID_RE.test(String(cotizacionId ?? ""))) return { ok: false, error: "cotizacion_id inválido" };
  const path = String(documento.path ?? "");
  const prefix = `${cotizacionId}/`;
  const rest = path.startsWith(prefix) ? path.slice(prefix.length) : "";
  if (!rest || !/^[A-Za-z0-9_-]{1,120}\.pdf$/.test(rest)) {
    return { ok: false, error: "Ruta de PDF inválida" };
  }
  const filename = /^[A-Za-z0-9_-]{1,120}\.pdf$/.test(String(documento.filename ?? ""))
    ? String(documento.filename)
    : rest;
  return { ok: true, path, filename };
}

/** Texto para canales sin adjunto (WhatsApp) o como respaldo: mensaje + enlace firmado. */
export function textoConEnlace(contenido, url) {
  return `${String(contenido ?? "").trim()}\n\n📄 Cotización (PDF, enlace válido 30 días):\n${url}`;
}

/** Caption seguro para sendDocument (Telegram corta en 1024). */
export function captionTelegram(contenido) {
  const t = String(contenido ?? "").trim();
  return t.length <= TELEGRAM_CAPTION_MAX ? t : `${t.slice(0, TELEGRAM_CAPTION_MAX - 1)}…`;
}

/** Lo que queda registrado en `mensajes` para que el panel muestre qué se envió. */
export function textoRegistro(contenido, { filename, modo, url }) {
  const base = String(contenido ?? "").trim();
  return modo === "adjunto" ? `${base}\n\n📎 ${filename}` : textoConEnlace(base, url);
}

/** No degradamos una cotización ya aceptada/rechazada al reenviarla. */
export function estatusTrasEnvio(actual) {
  return actual === "aceptada" || actual === "rechazada" ? actual : "enviada";
}
