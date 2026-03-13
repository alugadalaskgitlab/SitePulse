export function canonicalizeMachineType(name: string): string {
  return name
    .replace(/\s+PLANT\s+INTERCARTING/gi, '')
    .replace(/\s+INTERCARTING/gi, '')
    .replace(/\s+PLANT$/i, '')
    .replace(/-PLANT$/i, '')
    .replace(/-SITE$/i, '')
    .replace(/-\d+(\s+.*)?$/i, '')
    .replace(/-[A-Z][A-Z\s]+$/i, '')
    .trim();
}
