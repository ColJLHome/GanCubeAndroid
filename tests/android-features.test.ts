// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
const { nativeRequest, connectGanCube } = vi.hoisted(() => ({ nativeRequest: vi.fn(), connectGanCube: vi.fn() }));
vi.mock('../src/native', () => ({ isAndroid: true, nativeRequest, NativeCube: {} }));
vi.mock('gan-web-bluetooth', () => ({ connectGanCube }));

test('Android lists saved cubes, reuses the selected MAC, and exposes the timings tab', async () => {
  localStorage.clear(); sessionStorage.clear();
  document.body.innerHTML = '<div id="app"></div>';
  nativeRequest.mockImplementation(async (path: string) => path === 'cubes'
    ? [{ name: 'Imported GAN', mac: 'AA:BB:CC:DD:EE:FF' }]
    : path.startsWith('timings') ? [] : null);
  const disconnect = vi.fn();
  connectGanCube.mockImplementation(async provider => {
    const mac = await provider({ id: '11:22:33:44:55:66', name: 'GANic4', gatt: { disconnect } }, false);
    expect(mac).toBe('AA:BB:CC:DD:EE:FF');
    throw new DOMException('Cancelled after checking MAC', 'NotFoundError');
  });
  await import('../src/main');
  try {
    expect(document.querySelector('#known-cubes h3')?.textContent).toBe('Saved cubes on this device');
    const saved = document.querySelector<HTMLButtonElement>('#known-cubes-list button')!;
    expect(saved.textContent).toContain('Imported GAN');
    saved.click();
    await vi.waitFor(() => expect(connectGanCube).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(disconnect).toHaveBeenCalled());
    location.hash = '#timings';
    window.dispatchEvent(new Event('hashchange'));
    expect(document.getElementById('timings-screen')?.hidden).toBe(false);
    expect(document.getElementById('cube-screen')?.hidden).toBe(true);
  } finally {
    window.dispatchEvent(new Event('pagehide'));
    location.hash = '';
  }
});
