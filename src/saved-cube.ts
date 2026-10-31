import { databaseRequest } from './database';
export interface SavedCube { id: string; name: string; mac: string }
const KEY = 'gancube.lastCube.v1';
export const validMac = (value: string) => /^([\da-f]{2}:){5}[\da-f]{2}$/i.test(value);
export function loadCube(): SavedCube | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return value && typeof value.id === 'string' && value.id.length > 0 &&
      typeof value.name === 'string' && typeof value.mac === 'string' && validMac(value.mac)
      ? { id: value.id, name: value.name, mac: value.mac.toUpperCase() } : null;
  } catch { return null; }
}
export async function saveCube(value: SavedCube): Promise<boolean> {
  try {
    await databaseRequest('settings/last-cube', { method: 'PUT', body: JSON.stringify(value) });
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* Optional browser cache. */ }
    return true;
  } catch { return false; }
}
export async function restoreCube(): Promise<SavedCube | null> {
  const saved = await databaseRequest<SavedCube | null>('settings/last-cube');
  if (saved) return saved;
  const legacy = loadCube();
  if (legacy && !(await saveCube(legacy))) throw new Error('Could not migrate saved cube settings to SQLite.');
  return legacy;
}
/** Never substitute a similarly named cube for the saved browser device ID. */
export async function findSavedDevice(saved: SavedCube): Promise<BluetoothDevice | undefined> {
  if (typeof navigator.bluetooth.getDevices !== 'function') return;
  try { return (await navigator.bluetooth.getDevices()).find(device => device.id === saved.id); }
  catch { return; }
}
