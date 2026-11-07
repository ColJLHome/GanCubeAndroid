// @vitest-environment jsdom
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { backupFilename, setupDatabaseBackup } from '../src/database-backup';
let button: HTMLButtonElement;
let feedback: HTMLElement;
beforeEach(() => {
  button = document.createElement('button');
  feedback = document.createElement('p');
  setupDatabaseBackup(button, feedback);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
test('names backups using a hyphenated UTC ISO timestamp', () => {
  expect(backupFilename(new Date('2026-10-31T07:54:02.123Z'))).toBe('gancube-2026-10-31T07-54-02-123Z.sqlite');
});
test('chooses the location before fetching and saves the SQLite blob there', async () => {
  let choose!: (value: any) => void;
  const picker = vi.fn(() => new Promise(resolve => { choose = resolve; }));
  const writable = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  const handle = { name: 'chosen-backup.sqlite', createWritable: vi.fn(async () => writable) };
  const blob = new Blob(['SQLite format 3']);
  const fetch = vi.fn(async () => ({ ok: true, blob: async () => blob }));
  vi.stubGlobal('showSaveFilePicker', picker);
  vi.stubGlobal('fetch', fetch);
  button.click();
  button.click();
  expect(picker).toHaveBeenCalledTimes(1);
  expect(picker.mock.calls[0][0]).toMatchObject({ suggestedName: expect.stringMatching(/^gancube-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z\.sqlite$/) });
  expect(fetch).not.toHaveBeenCalled();
  expect(button.disabled).toBe(true);
  choose(handle);
  await vi.waitFor(() => expect(feedback.textContent).toBe('Backup saved: chosen-backup.sqlite'));
  expect(writable.write).toHaveBeenCalledWith(blob);
  expect(writable.close).toHaveBeenCalledTimes(1);
  expect(writable.abort).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
test('cancelling the chooser does not request a backup', async () => {
  vi.stubGlobal('showSaveFilePicker', vi.fn(async () => { throw new DOMException('Cancelled', 'AbortError'); }));
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  button.click();
  await vi.waitFor(() => expect(feedback.textContent).toBe('Backup cancelled.'));
  expect(fetch).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
test('server failure does not open the chosen file for writing', async () => {
  const createWritable = vi.fn();
  vi.stubGlobal('showSaveFilePicker', vi.fn(async () => ({ createWritable })));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
  button.click();
  await vi.waitFor(() => expect(feedback.textContent).toContain('Backup failed.'));
  expect(createWritable).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
test('file write failure aborts the write and allows retry', async () => {
  const writable = { write: vi.fn(async () => { throw new Error('Disk full'); }), close: vi.fn(), abort: vi.fn(async () => {}) };
  vi.stubGlobal('showSaveFilePicker', vi.fn(async () => ({ createWritable: async () => writable })));
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['backup']) })));
  button.click();
  await vi.waitFor(() => expect(feedback.textContent).toContain('Disk full'));
  expect(writable.abort).toHaveBeenCalledTimes(1);
  expect(writable.close).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
test('browsers without a save picker use a named download', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('showSaveFilePicker', undefined);
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL });
  let filename = '';
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { filename = this.download; });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['backup']) })));
  button.click();
  await vi.waitFor(() => expect(feedback.textContent).toContain('Backup download started'));
  expect(filename).toMatch(/^gancube-.*\.sqlite$/);
  expect(document.querySelector('a')).toBeNull();
  vi.runOnlyPendingTimers();
  expect(revokeObjectURL).toHaveBeenCalledWith('blob:test');
});

test('restore requires confirmation and uploads the selected file', async () => {
  const { setupDatabaseRestore } = await import('../src/database-backup');
  const input = document.createElement('input');
  input.type = 'file';
  const file = new File(['backup'], 'other-server.sqlite');
  Object.defineProperty(input, 'files', { value: [file] });
  const onSuccess = vi.fn();
  setupDatabaseRestore(button, input, feedback, { canRestore: () => undefined, onSuccess });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ restored: true, previousBackup: 'previous.sqlite' }) }));
  vi.stubGlobal('fetch', fetch);
  input.dispatchEvent(new Event('change'));
  expect(fetch).not.toHaveBeenCalled();
  expect(feedback.textContent).toBe('Restore cancelled.');
  confirm.mockReturnValue(true);
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(fetch).toHaveBeenCalledWith('/api/database/restore', expect.objectContaining({ method: 'POST', body: file, headers: expect.objectContaining({ 'X-Gancube-Restore': 'true' }) }));
});

test('restore displays validation failures without reloading', async () => {
  const { setupDatabaseRestore } = await import('../src/database-backup');
  const input = document.createElement('input');
  input.type = 'file';
  Object.defineProperty(input, 'files', { value: [new File(['bad'], 'bad.sqlite')] });
  const onSuccess = vi.fn();
  setupDatabaseRestore(button, input, feedback, { canRestore: () => undefined, onSuccess });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Invalid backup' }) })));
  input.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(feedback.textContent).toContain('Invalid backup'));
  expect(onSuccess).not.toHaveBeenCalled();
  expect(button.disabled).toBe(false);
});
