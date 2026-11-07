import { BleClient, type BleDevice, type BleService } from '@capacitor-community/bluetooth-le';

// Adapt the Web Bluetooth surface used by gan-web-bluetooth while preserving
// its encryption, recovery and Gen2–Gen4 protocol implementations.
export class AndroidDevice extends EventTarget {
  readonly id: string;
  readonly name?: string;
  readonly gatt: AndroidGatt;
  constructor(device: BleDevice) {
    super();
    this.id = device.deviceId;
    this.name = device.name;
    this.gatt = new AndroidGatt(this);
  }
}

class AndroidGatt {
  connected = false;
  private services: BleService[] = [];
  constructor(readonly device: AndroidDevice) {}
  private disconnected = () => {
    if (!this.connected) return;
    this.connected = false;
    this.device.dispatchEvent(new Event('gattserverdisconnected'));
  };
  async connect() {
    await initialize();
    try {
      await BleClient.connect(this.device.id, this.disconnected, { timeout: 15000 });
      this.connected = true;
      this.services = await BleClient.getServices(this.device.id);
      return this;
    } catch (error) {
      await BleClient.disconnect(this.device.id).catch(() => {});
      this.disconnected();
      throw error;
    }
  }
  disconnect() {
    void BleClient.disconnect(this.device.id).catch(error => console.warn('Bluetooth disconnect failed', error)).finally(this.disconnected);
  }
  async getPrimaryServices() {
    return this.services.map(service => ({
      uuid: service.uuid,
      getCharacteristic: async (uuid: string) => {
        const found = service.characteristics.find(item => item.uuid.toLowerCase() === uuid.toLowerCase());
        if (!found) throw new Error(`Cube characteristic ${uuid} is unavailable.`);
        return new AndroidCharacteristic(this.device.id, service.uuid, found.uuid, !!found.properties.write);
      },
    }));
  }
}

class AndroidCharacteristic extends EventTarget {
  value?: DataView;
  constructor(private deviceId: string, private service: string, readonly uuid: string, private withResponse: boolean) { super(); }
  async writeValue(value: BufferSource) {
    const view = ArrayBuffer.isView(value)
      ? new DataView(value.buffer as ArrayBuffer, value.byteOffset, value.byteLength)
      : new DataView(value);
    if (this.withResponse) await BleClient.write(this.deviceId, this.service, this.uuid, view);
    else await BleClient.writeWithoutResponse(this.deviceId, this.service, this.uuid, view);
  }
  async startNotifications() {
    await BleClient.startNotifications(this.deviceId, this.service, this.uuid, value => {
      this.value = value;
      this.dispatchEvent(new Event('characteristicvaluechanged'));
    });
    return this;
  }
  async stopNotifications() {
    await BleClient.stopNotifications(this.deviceId, this.service, this.uuid);
    return this;
  }
}

let initialization: Promise<void> | undefined;
async function initialize() {
  await (initialization ??= BleClient.initialize({ androidNeverForLocation: true })
    .catch(error => { initialization = undefined; throw error; }));
  if (!await BleClient.isEnabled()) await BleClient.requestEnable();
}

const devices = new Map<string, AndroidDevice>();
export function installAndroidBluetooth() {
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: {
    requestDevice: async () => {
      await initialize();
      // Some cubes advertise only manufacturer data, without their GATT service.
      // The native picker supports one name prefix, so scan broadly to include
      // all three upstream prefixes and validate the selection before connecting.
      const selected = await BleClient.requestDevice();
      if (!/^(GAN|MG|AiCube)/.test(selected.name ?? '')) throw new Error('Select a supported GAN, MG or AiCube device.');
      const device = new AndroidDevice(selected);
      devices.set(device.id, device);
      return device;
    },
    getDevices: async () => {
      // Android IDs are MAC addresses; reconstruct only the exact saved cube.
      try {
        const saved = JSON.parse(localStorage.getItem('gancube.lastCube.v1') ?? 'null');
        if (saved?.id && !devices.has(saved.id)) devices.set(saved.id, new AndroidDevice({ deviceId: saved.id, name: saved.name }));
      } catch { /* No cached device. */ }
      return [...devices.values()];
    },
  } });
}
