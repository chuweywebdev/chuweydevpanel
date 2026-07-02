# ChuweyDevPanel

**ChuweyDevPanel** is a web-based server management dashboard accessible through a desktop application built with Electron and Express.js. It provides an intuitive interface for monitoring and controlling local servers via a clean, dark-themed UI.

## Features

- **Server Dashboard** — Real-time overview of running services, their status, and resource usage.
- **Terminal Access** — Built-in web terminal for executing commands directly from your browser.
- **File Manager** — Browse, upload, download, and manage files on your local server.
- **Process Monitor** — View running processes, CPU/memory usage, and terminate processes.
- **Notification System** — Receive alerts when servers go offline or encounter errors.

## Quick Start

### Standalone Server

```bash
node server.js
```

Open `http://localhost:1000` in your browser.

### Desktop Application

```bash
npm start
```

Launches the Electron desktop app, which starts the backend automatically.

## Packaging

Produce a Windows `.exe` installer:

```bash
npm run build
```

Output: `dist/ChuweyDevPanel Setup x.x.x.exe`

## Tech Stack

- **Backend** — Node.js, Express.js
- **Frontend** — HTML, CSS, JavaScript
- **Desktop Shell** — Electron
- **Installer** — electron-builder (NSIS)

## License

MIT
