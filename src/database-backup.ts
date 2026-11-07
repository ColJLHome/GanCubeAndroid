import { isAndroid, NativeCube } from './native';
export function backupFilename(date = new Date()): string {
  return `gancube-${date.toISOString().replace(/[:.]/g, '-')}.sqlite`;
}
type SavePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<FileSystemFileHandle>;

export function setupDatabaseBackup(button: HTMLButtonElement, feedback: HTMLElement) {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    button.disabled = true;
    const filename = backupFilename();
    let writable: FileSystemWritableFileStream | undefined;
    try {
      if (isAndroid) {
        await NativeCube.backup({ filename });
        feedback.textContent = `Backup saved: ${filename}`;
        return;
      }
      const picker = (window as Window & { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
      // Open the chooser before network work so the user's click still grants access.
      const handle = picker ? await picker.call(window, {
        suggestedName: filename,
        types: [{ description: 'SQLite database', accept: { 'application/vnd.sqlite3': ['.sqlite'] } }],
      }) : undefined;
      feedback.textContent = 'Creating database backup…';
      const response = await fetch('/api/database/backup', { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Backup request failed (${response.status}). Check that the API server is running.`);
      const blob = await response.blob();
      if (handle) {
        // Fetch successfully before opening the target file for writing.
        writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        writable = undefined;
        feedback.textContent = `Backup saved: ${handle.name}`;
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        feedback.textContent = `Backup download started: ${filename}. This browser uses its download settings for the save location.`;
      }
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      feedback.textContent = error instanceof DOMException && error.name === 'AbortError'
        ? 'Backup cancelled.'
        : `Backup failed. ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      button.disabled = false;
    }
  });
}

export function setupDatabaseRestore(
  button: HTMLButtonElement,
  input: HTMLInputElement,
  feedback: HTMLElement,
  options: { canRestore: () => string | undefined; onSuccess: () => void },
) {
  let busy = false;
  button.addEventListener('click', async () => {
    if (busy) return;
    if (!isAndroid) { input.click(); return; }
    const blocked = options.canRestore();
    if (blocked) { feedback.textContent = blocked; return; }
    if (!window.confirm('Restore a SQLite backup? This replaces all settings and timings. A recovery backup will be kept on this device.')) return;
    busy = true;
    button.disabled = true;
    try {
      const result = await NativeCube.restore();
      feedback.textContent = `Restored. Recovery backup: ${result.previousBackup}`;
      options.onSuccess();
    } catch (error) {
      feedback.textContent = `Restore failed. ${error instanceof Error ? error.message : String(error)}`;
    } finally { busy = false; button.disabled = false; }
  });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file || busy) return;
    input.value = '';
    const blocked = options.canRestore();
    if (blocked) { feedback.textContent = blocked; return; }
    if (file.size === 0 || file.size > 100 * 1024 * 1024) {
      feedback.textContent = 'Choose a nonempty SQLite backup smaller than 100 MB.';
      return;
    }
    if (!window.confirm(`Restore “${file.name}”? This replaces all settings and saved timings on this server. A backup of the current database will be kept on the server. Close other app tabs before continuing.`)) {
      feedback.textContent = 'Restore cancelled.';
      return;
    }
    busy = true;
    button.disabled = true;
    const main = document.querySelector('main');
    if (main) main.inert = true;
    feedback.textContent = 'Uploading and restoring database…';
    try {
      const response = await fetch('/api/database/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Gancube-Restore': 'true' },
        body: file,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Restore request failed (${response.status})`);
      feedback.textContent = `Database restored. Previous database saved on the server as ${result.previousBackup}. Reloading…`;
      options.onSuccess();
    } catch (error) {
      feedback.textContent = `Restore failed. ${error instanceof Error ? error.message : String(error)} If the connection was lost, reload to check the server before retrying.`;
    } finally {
      busy = false;
      button.disabled = false;
      if (main) main.inert = false;
    }
  });
}
