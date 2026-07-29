/**
 * Parse the error format produced by throwIfResNotOk in queryClient.ts:
 *   `${res.status}: ${text}`
 * where `text` is the raw response body (JSON or plain string).
 *
 * Returns { status, code, message } — code is only present when the server
 * sent a JSON body with a `code` field (e.g. "OVERRIDE_REASON_REQUIRED").
 */
export function parseApiError(error: unknown): { status?: number; code?: string; message: string } {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }
  // Match the "NNN: <body>" format emitted by throwIfResNotOk
  const match = error.message.match(/^(\d{3}):\s*([\s\S]*)$/);
  if (!match) return { message: error.message };

  const status = parseInt(match[1], 10);
  const body = match[2].trim();

  try {
    const json = JSON.parse(body);
    return {
      status,
      code: typeof json.code === "string" ? json.code : undefined,
      message: typeof json.error === "string" ? json.error
              : typeof json.message === "string" ? json.message
              : body,
    };
  } catch {
    return { status, message: body || error.message };
  }
}
