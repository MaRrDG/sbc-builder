// When the blocking club sync modal shows its progress.
import type { SyncStatus } from './api';

/**
 * Only while a web app tab is actually running the club sync: a sync that is due or queued with
 * no tab connected waits quietly (the "web app not open" notice says why) and runs once it opens.
 */
export function clubSyncRunning(status: Pick<SyncStatus, 'club'> | null, webAppLive: boolean): boolean {
  return webAppLive && status?.club?.state === 'running';
}
