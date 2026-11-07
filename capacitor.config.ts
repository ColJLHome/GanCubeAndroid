import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.coljlhome.gancube',
  appName: 'GAN Cube',
  webDir: 'dist',
  android: { minWebViewVersion: 124, backgroundColor: '#111820' }
};

export default config;
