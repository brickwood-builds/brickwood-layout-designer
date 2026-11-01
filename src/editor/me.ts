// Who is using this device (for the setup activity log). Kept on this device.
import { useSyncExternalStore } from 'react';

const KEY = 'brickwood.myName';
let name = (() => {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
})();
const listeners = new Set<() => void>();

export const getMyName = () => name;

export function setMyName(next: string) {
  name = next.trim();
  try {
    localStorage.setItem(KEY, name);
  } catch {
    // Not remembered in private browsing.
  }
  listeners.forEach((l) => l());
}

export function useMyName(): string {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => name,
  );
}
