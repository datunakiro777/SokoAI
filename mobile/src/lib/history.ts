import { Directory, File, Paths } from 'expo-file-system';
import type { Decision } from './decision';
import type { Photo } from './inference';

export type HistoryEntry = { id: string; createdAt: string; photos: Photo[]; decision: Decision };

// Photos are stored by file name: the app's document path can change between installs on iOS.
type StoredEntry = Omit<HistoryEntry, 'photos'> & { photos: { name: string; width: number; height: number }[] };

// Created on use, not on import: the file system is unavailable on some platforms (web).
const directory = () => new Directory(Paths.document, 'history');
const index = () => new File(directory(), 'history.json');

async function readStored(): Promise<StoredEntry[]> {
  if (!index().exists) return [];
  try {
    const entries = JSON.parse(await index().text());
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function writeStored(entries: StoredEntry[]) {
  directory().create({ intermediates: true, idempotent: true });
  // Write a temporary file first so a crash never leaves a half-written index.
  const temp = new File(directory(), 'history.json.tmp');
  if (!temp.exists) temp.create();
  temp.write(JSON.stringify(entries));
  temp.move(index(), { overwrite: true });
}

function resolve(entry: StoredEntry): HistoryEntry {
  return {
    ...entry,
    photos: entry.photos.map(({ name, width, height }) => ({ uri: new File(directory(), name).uri, width, height })),
  };
}

/** Newest first. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  return (await readStored()).map(resolve);
}

export async function loadCheck(id: string): Promise<HistoryEntry | undefined> {
  const entry = (await readStored()).find((item) => item.id === id);
  return entry && resolve(entry);
}

/** Copies the photos out of the camera cache and records the result. */
export async function saveCheck(photos: Photo[], decision: Decision): Promise<HistoryEntry> {
  directory().create({ intermediates: true, idempotent: true });
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const stored: StoredEntry = { id, createdAt: new Date().toISOString(), decision, photos: [] };
  for (const [position, photo] of photos.entries()) {
    const name = `${id}-${position}.jpg`;
    await new File(photo.uri).copy(new File(directory(), name));
    stored.photos.push({ name, width: photo.width, height: photo.height });
  }
  writeStored([stored, ...(await readStored())]);
  return resolve(stored);
}

function deletePhotos(entry: StoredEntry) {
  for (const { name } of entry.photos) {
    const file = new File(directory(), name);
    try { if (file.exists) file.delete(); } catch { /* A leftover photo is harmless. */ }
  }
}

export async function deleteCheck(id: string): Promise<void> {
  const entries = await readStored();
  const entry = entries.find((item) => item.id === id);
  if (entry) deletePhotos(entry);
  writeStored(entries.filter((item) => item.id !== id));
}

export async function clearHistory(): Promise<void> {
  for (const entry of await readStored()) deletePhotos(entry);
  writeStored([]);
}
