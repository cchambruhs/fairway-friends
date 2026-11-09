// @polsia:user-owned — one deterministic comparison rule for signup and imports.

export function normalizeUDiscUsername(value: string): string {
  return value.normalize('NFKC').trim().replace(/^@/u, '').toLocaleLowerCase('en-US');
}
