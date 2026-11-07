import { Capacitor, registerPlugin } from '@capacitor/core';

export const isAndroid = Capacitor.getPlatform() === 'android';
export const NativeCube = registerPlugin<{
  request(options: { path: string; method: string; body?: string }): Promise<{ value: unknown }>;
  backup(options: { filename: string }): Promise<void>;
  restore(): Promise<{ previousBackup: string }>;
}>('NativeCube');

export async function nativeRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const result = await NativeCube.request({ path, method: options?.method ?? 'GET', body: options?.body as string | undefined });
  return result.value as T;
}
