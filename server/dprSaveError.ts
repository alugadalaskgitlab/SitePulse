/**
 * Database wrappers may put SQL and bound values in message/stack/detail.
 * Log only diagnostic metadata, never the error object or request body.
 */
export function dprSaveErrorMetadata(error: unknown): Record<string, string> {
  const metadata: Record<string, string> = {};
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (seen.has(current)) break;
    seen.add(current);
    const value = current as Record<string, unknown>;
    if (typeof value.code === "string" && /^[0-9A-Z]{5}$/.test(value.code)) {
      metadata.sqlState = value.code;
    }
    for (const field of ["table", "column", "constraint"] as const) {
      if (typeof value[field] === "string" && /^[a-z_][a-z0-9_]{0,62}$/.test(value[field])) {
        metadata[field] = value[field];
      }
    }
    if (current instanceof TypeError) metadata.errorType = "TypeError";
    else if (current instanceof RangeError) metadata.errorType = "RangeError";
    current = value.cause;
  }
  return { errorType: "Error", ...metadata };
}