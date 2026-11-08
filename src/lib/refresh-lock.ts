const lock = { running: false };

export function isRefreshRunning(): boolean {
  return lock.running;
}

export function tryAcquireRefreshLock(): boolean {
  if (lock.running) return false;
  lock.running = true;
  return true;
}

export function releaseRefreshLock(): void {
  lock.running = false;
}

export function resetRefreshLockForTests(): void {
  lock.running = false;
}
