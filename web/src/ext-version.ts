// Extension version rules, pure (the update notice in App / UpdateBanner).

export interface ExtensionRelease {
  version: string;
  notes: string[];
  /** Oldest extension the server still supports; older ones get a required update. */
  minVersion?: string;
}

/** -1 / 0 / 1 for dotted numeric versions ("0.3.0" < "0.4.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** True when the extension that last connected this account is older than the one we ship. */
export const needsUpdate = (installed: string | null | undefined, latest: ExtensionRelease | null) =>
  !!latest && (!installed || compareVersions(latest.version, installed) > 0);

/** True only when the installed version is known and older than the server's minimum: the notice can't be hidden. */
export const updateRequired = (installed: string | null | undefined, latest: ExtensionRelease | null) =>
  !!latest?.minVersion && !!installed && compareVersions(latest.minVersion, installed) > 0;
