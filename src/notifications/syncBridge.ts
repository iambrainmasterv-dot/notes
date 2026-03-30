type SyncFn = () => void;

let syncFn: SyncFn | null = null;

export function setAndroidDataSyncCallback(fn: SyncFn | null): void {
  syncFn = fn;
}

export function notifyAndroidDataChanged(): void {
  syncFn?.();
}
