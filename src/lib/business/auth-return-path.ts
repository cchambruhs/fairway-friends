// @polsia:user-owned — accepts only local path return destinations for auth flows.
const LOCAL_ORIGIN = 'https://fairway-friends.invalid';

export function safeSameOriginPath(value: string | undefined, fallback: string): string {
  const containsControlCharacter = value
    ? [...value].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    : false;

  if (
    !value ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    containsControlCharacter
  ) {
    return fallback;
  }

  try {
    const path = new URL(value, LOCAL_ORIGIN);
    if (
      path.origin !== LOCAL_ORIGIN ||
      path.pathname.startsWith('/api/') ||
      path.pathname.startsWith('/_next/')
    ) {
      return fallback;
    }
    return `${path.pathname}${path.search}${path.hash}`;
  } catch {
    return fallback;
  }
}
