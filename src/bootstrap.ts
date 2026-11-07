import { isAndroid } from './native';

if (isAndroid) {
  const { installAndroidBluetooth } = await import('./android-bluetooth');
  installAndroidBluetooth();
  document.documentElement.classList.add('android');
}
await import('./main');
