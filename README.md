# ChuweyDevPanel

**ChuweyDevPanel** is a desktop app (Electron + Express.js) for managing remote servers via SSH. It bundles a web frontend with an embedded backend server for a seamless terminal experience.

## Features

- **SSH Session Manager** — Connect, persist, and reuse SSH sessions with keepalive.
- **Web Terminal** — Full PTY shell via xterm.js and WebSocket (SSH2).
- **Docker Exec** — Run commands inside containers on connected hosts.
- **Server Dashboard** — Overview of registered servers, quick-connect, status indicators.
- **Snippet Runner** — Save and execute common command snippets.
- **Telegram Backup** — Export/restore server config and snippet data via bot.

## Quick Start

### Install & Run

```bash
npm install
npm start
```

The Electron window launches and connects to the embedded server at `localhost:1000`.

### Standalone (browser only)

```bash
node server.js
```

Open `http://localhost:1000` in your browser.

## Packaging

```bash
npm run build
```

Output: `dist/ChuweyDevPanel Setup 1.0.3.exe`

> Build is unsigned — Windows may show a SmartScreen warning on first run.

## Troubleshooting

| Problem | Fix |
|---|---|
| **Port 1000 in use** | Kill the existing process (`taskkill /F /PID <id>`) or change `PORT` in `server.js` |
| **SSH connection fails** | Ensure the remote host allows password or key auth on the configured port |
| **Session disconnects (1006)** | The server automatically reconnects on WebSocket close; check network stability |

## Tech Stack

- **Backend** — Node.js, Express.js, SSH2, ws
- **Frontend** — HTML, CSS, vanilla JS, xterm.js
- **Desktop Shell** — Electron + electron-builder
- **Installer** — NSIS (via electron-builder)

## License

MIT
