/** Keep one exact write intent stable across network-ambiguous retries.
 * Changed content or baseline tokens are a new intent, never a stale replay. */
export function createDprSectionSaveAttempt(newKey: () => string = () => crypto.randomUUID()) {
  let previous: { fingerprint: string; clientKey: string } | undefined;
  return <T extends Record<string, unknown>>(body: T, section: string): T & { clientKey: string } => {
    const fingerprint = JSON.stringify([section, body]);
    if (!previous || previous.fingerprint !== fingerprint) previous = { fingerprint, clientKey: newKey() };
    return { ...body, clientKey: previous.clientKey };
  };
}