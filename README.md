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

## Run as a Linux service (systemd)

Use a systemd user service to start the production build automatically under your Linux account. Run these commands as your normal user from the project directory:

```sh
npm install
npm run build
mkdir -p ~/.config/systemd/user
command -v node
pwd
```

Create `~/.config/systemd/user/gancube.service` with the following contents. Replace `/absolute/path/to/gancube` with the directory printed by `pwd`, and `/absolute/path/to/node` with the executable printed by `command -v node`. Use absolute paths; systemd does not load your shell profile or expand `~` in these settings. If either path contains spaces, wrap the entire path in double quotes.

```ini
[Unit]
Description=GAN Cube viewer and timer

[Service]
Type=simple
WorkingDirectory=/absolute/path/to/gancube
ExecStart=/absolute/path/to/node server/index.mjs
Environment=NODE_ENV=production
Environment=PORT=3001
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
```

The working directory is required to find `dist` and the default `data/gancube.sqlite` database. Your user must be able to write to the project’s `data` directory. To store the database elsewhere, add `Environment="GANCUBE_DB_PATH=/absolute/path/to/gancube.sqlite"` to `[Service]`. The service does not inherit variables from your interactive shell.

Enable and start the service:

```sh
systemctl --user daemon-reload
systemctl --user enable --now gancube.service
systemctl --user status gancube.service
```

Open `http://localhost:3001` in your local browser. Bluetooth access still happens in the browser, so the service needs no Bluetooth permissions. Stop any manually started API using the same port before starting the service.

To start at boot and keep running after logout, enable lingering for your account (this may require administrator authentication):

```sh
loginctl enable-linger "$USER"
```

View logs, restart after rebuilding or updating the app, or stop and disable the service:

```sh
journalctl --user -u gancube.service -f
systemctl --user restart gancube.service
systemctl --user disable --now gancube.service
```

After changing the unit file, run `systemctl --user daemon-reload` and restart the service. If a Node version manager changes or removes the executable path, update `ExecStart` as well. Rebuild with `npm run build` after frontend changes; restarting alone does not rebuild the app.

## Connect and use

Wake the cube with a few turns, close CubeStation or any other connected cube app, then open **Settings → Choose cube**. The app tries automatic Bluetooth MAC discovery and offers manual entry when needed. Find the hardware MAC in CubeStation device information or a BLE scanner; the browser device ID is not the MAC.

The last cube’s name, browser device ID, and MAC address are saved in SQLite. Existing browser settings migrate automatically when the database is empty. A browser cache remains available if the API is offline. On startup, the app makes one automatic attempt to reconnect to the exact saved device using existing browser permission. It does not open a chooser automatically or retry in a loop. Click **Disconnected** in the header to retry manually. If permission is unavailable, choose the cube again in Settings. A saved MAC is never automatically reused for a different device. Browser Bluetooth permissions are still specific to the browser and origin.

Hold the cube with the white centre on top, green centre facing you, and red centre on your right. The view renders initial state and incoming face turns in this fixed reference; it does not track whole-cube rotations. Before receiving state, it displays a labelled reference. To synchronise, solve the physical cube and click **Reset to solved**. This resets both the display and the connected cube’s internal reported state; it does not physically solve the cube.

## Timings and database

**Start timer** below the cube begins a counting timer. It automatically stops when the cube reaches solved, retaining the final time. Starting while already solved requires an unsolved state before accepting the solved finish. Click again to stop manually. Disconnecting interrupts the run; resetting cancels it.

Only runs that finish by solving the cube are added to history and stored in SQLite. Manual stops, resets, page closes, and disconnects do not create timing records. Each solved run includes a unique ID, start/end timestamps, duration in milliseconds, cube identity, and starting facelets. **Recent timings** shows the latest 20 solves. A solve appears immediately, labelled **Pending save** until its database write succeeds. Database records remain available after browser or API restarts. Pending solves are cached in browser storage when possible and retried on startup or via **Refresh / retry saves**. Timing IDs prevent duplicate records on retries. Older unfinished records remain in SQLite but are excluded from history; new unfinished records are rejected by the API.

The database file is `data/gancube.sqlite`, created automatically by the API. SQLite uses WAL mode; stop the API before copying the database for a simple backup. Database files are excluded from version control. Override the location with `GANCUBE_DB_PATH`; override the API port with `PORT`. If changing the API port in development, also update the proxy in `vite.config.ts`.

Tables: `settings` stores the last cube as JSON, and `timings` stores timing records with an index on start time. Schema version is tracked with `PRAGMA user_version`.

API routes:

- `GET /api/settings/last-cube`
- `PUT /api/settings/last-cube`
- `GET /api/settings/debugging`
- `PUT /api/settings/debugging`
- `GET /api/timings?limit=20` (maximum 500 per request)
- `POST /api/timings` (idempotent by timing ID)

## Debug log

**Settings → Disable debugging** immediately clears the in-memory and stored debug log and stops all new log entries. Enable debugging to start a fresh log. The preference is saved in SQLite and cached in the browser so it also applies while the API is offline.

When enabled, **Log** displays timestamped connection attempts, commands, moves, state snapshots, packet diagnostics, native disconnects, and JavaScript errors. **Copy log** copies the history; if clipboard access fails, select/copy from the field. **Clear log** removes it. The latest 500 entries persist in sessionStorage within the same tab; debug logs are separate from timing records in SQLite. Browser disconnect events do not supply a radio-level reason.

## Compatibility and library patch

Uses [gan-web-bluetooth](https://github.com/afedotov/gan-web-bluetooth) for GAN Gen2–Gen4 protocols, selected by GATT service. Its device list does not explicitly name the i Carry 4. State and battery decoding and connection have been observed with the user's GANic4; full firmware compatibility still requires physical testing.

`patches/gan-web-bluetooth+3.0.2.patch` adds a previously permitted device argument for reconnecting without a chooser, serialises all characteristic writes (including recovery requests), and exposes transport diagnostics via `gan-cube-diagnostic` events. It also respects notification DataView offsets/lengths. For GANic4 devices on the Gen4 service, the patch establishes its move counter from the first live turn because observed state snapshots keep reporting zero. Later live-turn gaps still use move history recovery; a stalled recovery requests a fresh state instead of disconnecting. Regression tests replay the affected device’s packet sequence. Other Gen4 models retain their existing counter handling. The dependency is pinned and patched automatically by `npm install`; run `npm run postinstall` if lifecycle scripts were disabled. Initial request failures do not close an otherwise usable Bluetooth connection.

## Validation

```sh
npm test
npm run build
```

Tests cover SQLite persistence through reopening a real database, API validation and duplicate retries, settings migration, pending timing retries, timer outcomes, cube state changes, and mocked Bluetooth connection handling. Radio behaviour still requires the physical cube.
