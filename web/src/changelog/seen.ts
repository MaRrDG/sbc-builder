// Which changelog entry this browser saw last (the sidebar dot). Per browser only; blocked storage = always unread.
import { useEffect, useState } from 'react';
import { CHANGELOG, hasUnread } from '../../../shared/changelog';

const KEY = 'sbc-changelog-seen';
const SEEN = 'fc-changelog-seen';

function readSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Called by the changelog page: the newest entry counts as read. */
export function markSeen(): void {
  if (!CHANGELOG.length) return;
  try {
    localStorage.setItem(KEY, CHANGELOG[0].id);
  } catch {
    /* private mode: the dot stays */
  }
  window.dispatchEvent(new Event(SEEN));
}

/** True while the newest entry was not opened in this browser. */
export function useChangelogUnread(): boolean {
  const [unread, setUnread] = useState(() => hasUnread(CHANGELOG, readSeen()));
  useEffect(() => {
    const update = () => setUnread(hasUnread(CHANGELOG, readSeen()));
    window.addEventListener(SEEN, update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener(SEEN, update);
      window.removeEventListener('storage', update);
    };
  }, []);
  return unread;
}
