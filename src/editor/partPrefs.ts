// Favourite and recently used parts (FR-07.07), kept on this device across projects.
// Whole part entries are stored, so they show at once (before the parts list loads).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { libraryIfLoaded, loadLibrary, type LibraryPart, type PartsLibrary } from '../domain/partsLibrary';

const FAV = 'brickwood.favouriteParts';
const RECENT = 'brickwood.recentParts';
const RECENT_MAX = 12;

export interface PartPrefs {
  favourites: LibraryPart[];
  recent: LibraryPart[];
}

function read(key: string): LibraryPart[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(v) ? (v as LibraryPart[]).filter((p) => p && typeof p.key === 'string') : [];
  } catch {
    return [];
  }
}

function write(key: string, parts: LibraryPart[]) {
  try {
    localStorage.setItem(key, JSON.stringify(parts));
  } catch {
    // Storage unavailable (private browsing): favourites last until the page closes.
  }
}

let state: PartPrefs = { favourites: read(FAV), recent: read(RECENT) };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const getPartPrefs = () => state;

export function usePartPrefs(): PartPrefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const isFavourite = (key: string) => state.favourites.some((p) => p.key === key);

export function toggleFavourite(part: LibraryPart) {
  const favourites = isFavourite(part.key) ? state.favourites.filter((p) => p.key !== part.key) : [...state.favourites, part];
  state = { ...state, favourites };
  write(FAV, favourites);
  emit();
}

export function noteUsed(part: LibraryPart) {
  const recent = [part, ...state.recent.filter((p) => p.key !== part.key)].slice(0, RECENT_MAX);
  state = { ...state, recent };
  write(RECENT, recent);
  emit();
}

/** Library parts to offer in Draw: favourites, then recent (no repeats). */
export function preferredParts(): LibraryPart[] {
  const seen = new Set<string>();
  return [...state.favourites, ...state.recent].filter((p) => !seen.has(p.key) && seen.add(p.key));
}

/** The library entry for a placed piece ("rb:<no>"), loading the parts list if needed. */
export function useLibraryPart(catalogKey: string | undefined): LibraryPart | null {
  const partNo = catalogKey?.startsWith('rb:') ? catalogKey.slice(3) : null;
  const [lib, setLib] = useState<PartsLibrary | null>(libraryIfLoaded());
  useEffect(() => {
    if (!partNo || lib) return;
    let live = true;
    loadLibrary().then((l) => live && setLib(l), () => undefined);
    return () => {
      live = false;
    };
  }, [partNo, lib]);
  if (!partNo) return null;
  return lib?.byNo.get(partNo) ?? [...state.favourites, ...state.recent].find((p) => p.partNo === partNo) ?? null;
}
