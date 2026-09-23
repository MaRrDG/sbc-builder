/** Where to go after signing in: only a path on this site, never back to the sign-in screen. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !/^\/(?![/\\])\S*$/.test(raw)) return '/';
  if (raw === '/signin' || raw.startsWith('/signin/') || raw.startsWith('/signin?')) return '/';
  return raw;
}
