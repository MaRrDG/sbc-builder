/** EA formation name -> "4-3-3", "4-3-3 (2)" for the a / b / c variants. Unknown names stay as sent. */
export function formationLabel(f: string): string {
  const m = /^f(\d+)([a-z]?)$/.exec(f);
  if (!m) return f;
  const base = m[1].split('').join('-');
  return m[2] ? `${base} (${m[2].charCodeAt(0) - 95})` : base;
}
