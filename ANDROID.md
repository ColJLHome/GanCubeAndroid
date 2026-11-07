# GAN Cube for Android

The Android app bundles the existing TypeScript UI with Capacitor. Native Bluetooth LE
feeds the original patched `gan-web-bluetooth` Gen2–Gen4 protocol drivers. Settings
and solved timings use Android SQLite with the desktop project's schema, and
TNoodle's standalone min2phase 0.20.0 engine generates random-state 3×3 scrambles
on a worker thread. No desktop server,
account, internet connection, or TNoodle service is needed on the phone.

## Install

Copy `artifacts/gancube-small.apk` to your Android phone, open it, and allow your
file manager to install apps when Android requests it. This is an optimized,
non-debuggable build signed with the existing development key, so it can update
the earlier debug APK. Requires Android 8+ with Android System WebView/Chrome 124+.

1. Enable Bluetooth, wake the cube with a few turns, and disconnect CubeStation.
2. Open Settings → Choose cube, grant Nearby devices permission, and select the cube.
   Android 11 and earlier require location permission and enabled location services for BLE scans.
3. The Android Bluetooth address supplies the encryption MAC automatically. The
   advanced field remains available if a particular cube needs a different address.
4. Hold white on top, green facing you, red to the right; solve and reset to synchronise.
5. Use Guided scramble, then start the timer. Solving stops it and saves the result.

The screen stays awake while the app is open. Moving the app to the background
interrupts the timer and disconnects the cube; tap Disconnected to reconnect.
Uninstalling the app deletes its local data, so export a backup first.

## Backup and restore

Upstream changes through `36c817c` are included in Android version 1.2:
Settings retains multiple cubes by MAC address, and a separate Timings tab shows
the complete solve history with Back/Next and selectable page sizes. The Cube
screen keeps summary statistics for the latest 20 solves.

The Android saved-cube registry lives on the device. Select an entry in Settings,
then choose that same physical cube in the Bluetooth picker to reuse its saved
MAC address. Existing last-cube settings are retained automatically. The registry
is included in SQLite backups, so a backup exported from the server can bring its
saved addresses onto Android; the app does not synchronise live with the server.

Settings → Back up database uses Android's document picker to save a standalone
`.sqlite` file. Restore uses the document picker too, checks integrity and schema
before changes, and replaces settings and timings in a transaction. The previous
database is kept under `Android/data/com.coljlhome.gancube/files/` as
`gancube-before-restore-<timestamp>.sqlite` (accessible via `adb`/device tools).
Desktop and Android backups share schema version 1. After importing a desktop
backup, choose your cube again: desktop browser IDs differ from Android MAC IDs.

## Build

Use Node 22.22.2+, JDK 21, and Android SDK platform 36 with build tools 36.0.0.
Set `JAVA_HOME` and `ANDROID_HOME`, or open `android/` in Android Studio and let it
configure the SDK. The build helper also detects this workspace's `.runtime` tools.

```sh
npm ci
npm run android:build
```

Output: `android/app/build/outputs/apk/sideload/app-sideload.apk`.
`npm run android:build:debug` creates an unoptimized debug build for development.
For Android Studio: `npm run android:sync`, then `npx cap open android`.
For a distribution release, use Android Studio's **Generate Signed App Bundle / APK**
with your own release keystore. Keep that keystore for future updates.

## Verification

```sh
npm test
npm run android:test
npm run android:lint
npm run audit:android
```

The web tests include mocked native transport packets and disconnect cleanup.
Robolectric tests exercise actual Android SQLite persistence, duplicate saves,
backup/restore, invalid restore protection, and scramble reconstruction against
known sampled random states.
Lint checks Android integration. These do not validate the radio or a real cube.

On a physical phone, verify permission denial/retry, discovery, battery/state,
turns in both directions, reset, scramble correction, solve timing, reconnection,
background interruption, and backup/restore after restarting the app.

## Sources

Based on https://github.com/ColJLHome/gancube (see Git history).
TNoodle: https://github.com/thewca/tnoodle-lib/tree/0.20.0, GPL-3.0.
Capacitor: https://github.com/ionic-team/capacitor, MIT.
Bluetooth plugin: https://github.com/capacitor-community/bluetooth-le, MIT.
GAN protocol library: https://github.com/afedotov/gan-web-bluetooth, MIT.
See `THIRD_PARTY_NOTICES.md` for bundled dependency notices.

## Dependency policy

- Keep Capacitor and the BLE plugin as the maintained Android bridge. Replacing
  them with custom Bluetooth/permission/lifecycle code would add substantial code
  and hardware testing obligations. R8 removes unused bridge code from the APK.
- Keep the patched GAN library, RxJS, and AES implementation together. Avoid
  custom encryption and protocol forks just to reduce the package count.
- Depend only on TNoodle's `scrambler-min2phase` JAR. It has no transitive Maven
  dependencies. The full puzzle suite, SVG rendering, GWT exporter, other puzzle
  solvers and their logging dependency are not needed by this 3×3 app.
- The small adapter samples random legal states and rejects solved/single-turn
  states before solving in reverse with TNoodle's search parameters. It uses
  Android's `SecureRandom` and is a practice scrambler, not a certified TNoodle
  competition distribution.
- SQLite, JSON, file picking, threading and randomness use Android platform APIs.
  No extra database, storage, HTTP, analytics or UI framework is added.
- Express is a desktop/development dependency; it is not bundled in the APK.
  Vite hosts its API directly in development, so no process-runner package is needed.
- Direct npm versions and the GAN runtime dependencies are pinned; use `npm ci`.
  Commit `package-lock.json` and `android/app/gradle.lockfile`. Update dependencies
  intentionally, then rerun tests and the advisory check. To regenerate native
  locks, append `--write-locks` to the Gradle tasks being updated.
- Release and sideload builds enable R8 code shrinking, resource shrinking and
  obfuscation. Keep the mapping files for diagnosing a shipped version.

`npm run audit:android` runs npm's advisory audit and queries OSV for the resolved
native runtime versions, saving `artifacts/dependency-audit.json`. It uses Node's
built-in HTTP client and adds no scanner dependency. Advisory checks cover known
published findings; they do not prove that a library has no vulnerabilities.
