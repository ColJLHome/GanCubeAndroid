import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const env = { ...process.env };
// Support the workspace-local tools as well as standard Android Studio installs.
if (!env.JAVA_HOME && existsSync('.runtime/jdk')) {
  const jdk = readdirSync('.runtime/jdk').find(name => name.startsWith('jdk-'));
  if (jdk) env.JAVA_HOME = resolve('.runtime/jdk', jdk);
}
if (!env.ANDROID_HOME && existsSync('.runtime/android-sdk')) env.ANDROID_HOME = resolve('.runtime/android-sdk');
const windows = process.platform === 'win32';
const result = spawnSync(windows ? 'android\\gradlew.bat' : './android/gradlew',
  ['-p', 'android', ...(process.argv.slice(2).length ? process.argv.slice(2) : [':app:assembleDebug']), '--console=plain'],
  { env, stdio: 'inherit', shell: windows });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
