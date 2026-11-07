import { isAndroid } from './native';
/** Report actionable browser restrictions before opening the device chooser. */
export function bluetoothSupportIssue(): string | null {
  if (isAndroid) return null;
  if (!window.isSecureContext) {
    return 'This page is not secure enough for Bluetooth. Open the app at http://localhost:5173 on this computer, or serve it over HTTPS. A plain HTTP network address will not work.';
  }
  if (!navigator.bluetooth) {
    return 'This browser does not expose Web Bluetooth. Open this app’s URL in a standalone Chrome or Edge window with Web Bluetooth support. Embedded app previews may not expose Bluetooth.';
  }
  const policy = (document as Document & {
    permissionsPolicy?: { allowsFeature(feature: string): boolean };
    featurePolicy?: { allowsFeature(feature: string): boolean };
  }).permissionsPolicy ?? (document as Document & {
    featurePolicy?: { allowsFeature(feature: string): boolean };
  }).featurePolicy;
  if (policy && !policy.allowsFeature('bluetooth')) {
    return 'Bluetooth is blocked by this page’s permissions policy. If you are using an embedded preview, open the app URL directly in Chrome or Edge. Otherwise the hosting page must allow Bluetooth.';
  }
  return null;
}
