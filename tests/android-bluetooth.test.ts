// @vitest-environment jsdom
import { beforeEach, expect, test, vi } from 'vitest';
const ble = vi.hoisted(() => ({
  initialize: vi.fn(async () => {}), isEnabled: vi.fn(async () => true), requestEnable: vi.fn(async () => {}),
  requestDevice: vi.fn(), connect: vi.fn(async () => {}), disconnect: vi.fn(async () => {}), getServices: vi.fn(),
  write: vi.fn(), writeWithoutResponse: vi.fn(), startNotifications: vi.fn(), stopNotifications: vi.fn(),
}));
vi.mock('@capacitor-community/bluetooth-le', () => ({ BleClient: ble }));
beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });

test('native transport preserves packet offsets, notifications and disconnect events', async () => {
  const { AndroidDevice } = await import('../src/android-bluetooth');
  ble.getServices.mockResolvedValue([{ uuid: 'service', characteristics: [{ uuid: 'state', properties: { write: true } }] }]);
  const device = new AndroidDevice({ deviceId: 'AA:BB:CC:DD:EE:FF', name: 'GANic4' });
  const disconnected = vi.fn();
  device.addEventListener('gattserverdisconnected', disconnected);
  const gatt = await device.gatt.connect();
  const characteristic = await (await gatt.getPrimaryServices())[0].getCharacteristic('state');
  const listener = vi.fn();
  characteristic.addEventListener('characteristicvaluechanged', listener);
  await characteristic.startNotifications();
  const packet = new DataView(new Uint8Array([99, 1, 2, 88]).buffer, 1, 2);
  ble.startNotifications.mock.calls[0][3](packet);
  expect(listener).toHaveBeenCalledOnce();
  expect(characteristic.value?.getUint8(0)).toBe(1);
  await characteristic.writeValue(new Uint8Array(packet.buffer, 1, 2));
  expect(ble.write.mock.calls[0][3].byteLength).toBe(2);
  expect(ble.write.mock.calls[0][3].getUint8(0)).toBe(1);
  ble.connect.mock.calls[0][1]();
  expect(gatt.connected).toBe(false);
  expect(disconnected).toHaveBeenCalledOnce();
});

test('failed service discovery closes native connection', async () => {
  const { AndroidDevice } = await import('../src/android-bluetooth');
  ble.getServices.mockRejectedValueOnce(new Error('discovery failed'));
  const device = new AndroidDevice({ deviceId: 'AA:BB:CC:DD:EE:FF' });
  await expect(device.gatt.connect()).rejects.toThrow('discovery failed');
  expect(ble.disconnect).toHaveBeenCalledWith(device.id);
  expect(device.gatt.connected).toBe(false);
});

test('picker includes cubes that do not advertise service UUIDs', async () => {
  const { installAndroidBluetooth } = await import('../src/android-bluetooth');
  ble.requestDevice.mockResolvedValue({ deviceId: 'AA:BB:CC:DD:EE:FF', name: 'GANic4_test' });
  installAndroidBluetooth();
  const selected = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
  expect(selected.id).toBe('AA:BB:CC:DD:EE:FF');
  expect(ble.requestDevice).toHaveBeenCalledWith();
});

test('unsupported selections fail before opening GATT', async () => {
  const { installAndroidBluetooth } = await import('../src/android-bluetooth');
  ble.requestDevice.mockResolvedValue({ deviceId: 'AA:BB:CC:DD:EE:FF', name: 'Headphones' });
  installAndroidBluetooth();
  await expect(navigator.bluetooth.requestDevice({ acceptAllDevices: true })).rejects.toThrow('supported GAN');
  expect(ble.connect).not.toHaveBeenCalled();
});
