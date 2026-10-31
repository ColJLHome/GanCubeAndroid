// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { bluetoothSupportIssue } from '../src/bluetooth-support';
afterEach(() => vi.unstubAllGlobals());
function setup(secure: boolean, bluetooth: object | undefined, allowed = true) {
  vi.stubGlobal('isSecureContext', secure);
  vi.stubGlobal('navigator', { bluetooth });
  vi.stubGlobal('document', { featurePolicy: { allowsFeature: () => allowed } });
}
test('explains HTTP network address restriction', () => {
  setup(false, undefined);
  expect(bluetoothSupportIssue()).toContain('plain HTTP network address');
});
test('guides unsupported embedded browsers to a standalone window', () => {
  setup(true, undefined);
  expect(bluetoothSupportIssue()).toContain('standalone Chrome or Edge');
});
test('detects embedding permissions policy even when API is present', () => {
  setup(true, {}, false);
  expect(bluetoothSupportIssue()).toContain('permissions policy');
});
test('permits a supported secure context', () => {
  setup(true, {});
  expect(bluetoothSupportIssue()).toBeNull();
});
