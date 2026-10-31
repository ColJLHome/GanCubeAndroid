# GAN Cube

Bluetooth LE cube viewer and timer, built with TypeScript/Vite and a local Node API backed by SQLite.

## Run

Requires Node.js 22.13 or newer (uses built-in `node:sqlite`).

```sh
npm install
npm run dev
```

This starts both Vite and the SQLite API. If Vite was already running from an older version, stop it and restart with this command. Open the localhost URL printed by Vite (normally `http://localhost:5173`) in Chromium, Chrome, or Edge with Web Bluetooth support. On Linux Chromium, enable **Experimental Web Platform features** at `chrome://flags/#enable-experimental-web-platform-features` and relaunch.

Bluetooth requires localhost or HTTPS. A plain HTTP LAN address will not work. Browser and OS support varies; Safari and Firefox generally do not expose this API.

For a production build served by the local API:

```sh
npm run build
npm start
```

Open `http://localhost:3001`. The API binds to the local computer. No cloud account is required.

## Connect and use

Wake the cube with a few turns, close CubeStation or any other connected cube app, then open **Settings → Choose cube**. The app tries automatic Bluetooth MAC discovery and offers manual entry when needed. Find the hardware MAC in CubeStation device information or a BLE scanner; the browser device ID is not the MAC.

The last cube’s name, browser device ID, and MAC address are saved in SQLite. Existing browser settings migrate automatically when the database is empty. A browser cache remains available if the API is offline. Click **Disconnected** in the header to reconnect to the exact saved device. If permission is unavailable, choose the cube again in Settings. A saved MAC is never automatically reused for a different device. Browser Bluetooth permissions are still specific to the browser and origin.

Hold the cube with the white centre on top, green centre facing you, and red centre on your right. The view renders initial state and incoming face turns in this fixed reference; it does not track whole-cube rotations. Before receiving state, it displays a labelled reference. To synchronise, solve the physical cube and click **Reset to solved**. This resets both the display and the connected cube’s internal reported state; it does not physically solve the cube.

## Timings and database

**Start timer** below the cube begins a counting timer. It automatically stops when the cube reaches solved, retaining the final time. Starting while already solved requires an unsolved state before accepting the solved finish. Click again to stop manually. Disconnecting interrupts the run; resetting cancels it.

Every finished run is stored with a unique ID, start/end timestamps, duration in milliseconds, outcome (`solved`, `manual`, `reset`, or `interrupted`), cube identity, and starting facelets. **Recent timings** shows the latest 20 runs. Database records remain available after browser or API restarts. Pending writes are cached in browser storage when possible and retried on startup or via **Refresh / retry saves**. Timing IDs prevent duplicate records on retries. Closing the page attempts to record an interrupted run; abrupt process termination can still lose a running, unfinished timer.

The database file is `data/gancube.sqlite`, created automatically by the API. SQLite uses WAL mode; stop the API before copying the database for a simple backup. Database files are excluded from version control. Override the location with `GANCUBE_DB_PATH`; override the API port with `PORT`. If changing the API port in development, also update the proxy in `vite.config.ts`.

Tables: `settings` stores the last cube as JSON, and `timings` stores timing records with an index on start time. Schema version is tracked with `PRAGMA user_version`.

API routes:

- `GET /api/settings/last-cube`
- `PUT /api/settings/last-cube`
- `GET /api/timings?limit=20` (maximum 500 per request)
- `POST /api/timings` (idempotent by timing ID)

## Debug log

**Log** displays timestamped connection attempts, commands, moves, state snapshots, packet diagnostics, native disconnects, and JavaScript errors. **Copy log** copies the history; if clipboard access fails, select/copy from the field. **Clear log** removes it. The latest 500 entries persist in sessionStorage within the same tab; debug logs are separate from timing records in SQLite. Browser disconnect events do not supply a radio-level reason.

## Compatibility and library patch

Uses [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) for GAN Gen2–Gen4 protocols, selected by GATT service. Its device list does not explicitly name the i Carry 4. State and battery decoding and connection have been observed with the user's GANic4; full firmware compatibility still requires physical testing.

`patches/gan-web-bluetooth+3.0.2.patch` adds a previously permitted device argument for reconnecting without a chooser, serialises all characteristic writes (including recovery requests), and exposes transport diagnostics via `gan-cube-diagnostic` events. It also respects notification DataView offsets/lengths. The dependency is pinned and patched automatically by `npm install`; run `npm run postinstall` if lifecycle scripts were disabled. Initial request failures do not close an otherwise usable Bluetooth connection.

## Validation

```sh
npm test
npm run build
```

Tests cover SQLite persistence through reopening a real database, API validation and duplicate retries, settings migration, pending timing retries, timer outcomes, cube state changes, and mocked Bluetooth connection handling. Radio behaviour still requires the physical cube.
