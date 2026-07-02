const { app, BrowserWindow, ipcMain } = require('electron');
const { fork } = require('child_process');
const path = require('path');
const fs = require('fs');
const waitOn = require('wait-on');

const PORT = 1000;
const SERVER_URL = `http://localhost:${PORT}`;
const LOG_FILE = path.join(app.getPath('userData'), 'devpanel.log');

let mainWindow = null;
let serverProcess = null;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

/*
 * Path helpers resolve correctly in both development and packaged modes.
 * In a packaged app, forked child processes and preload scripts need to be
 * outside the asar archive (asarUnpack in package.json).
 */
function unpackedPath(sub) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', sub);
  }
  return path.join(__dirname, sub);
}

function serverScriptPath() { return unpackedPath('server.js'); }
function preloadScriptPath() { return unpackedPath('preload.js'); }
function publicDirPath() { return unpackedPath('public'); }
function iconPath() { return path.join(publicDirPath(), 'icon.png'); }

/*
 * Spawn the Express server as a forked child process.
 * Uses wait-on to poll the HTTP endpoint until the server is ready,
 * then resolves.  Rejects if the server doesn't respond in time.
 */
function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = fork(serverScriptPath(), [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: {
        ...process.env,
        PORT: String(PORT),
        PUBLIC_PATH: publicDirPath()
      }
    });

    serverProcess.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
    serverProcess.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

    serverProcess.on('error', reject);

    serverProcess.on('exit', (code) => {
      log('Server process exited with code ' + code);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(
          'data:text/html,' + encodeURIComponent(
            '<h1 style="font-family:sans-serif;color:#e06c75">Server Crashed</h1>' +
            '<p style="font-family:sans-serif;color:#abb2bf">' +
            'The backend server exited unexpectedly (code: ' + code + ').<br>' +
            'Please restart the application.</p>'
          )
        ).catch(() => {});
      }
    });

    waitOn({ resources: [SERVER_URL], timeout: 30000 })
      .then(() => resolve())
      .catch(() => reject(new Error('Server did not respond within 30 s')));
  });
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 520,
    show: false,
    title: 'ChuweyDevPanel',
    icon: iconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: preloadScriptPath()
    }
  });

  mainWindow.loadURL(SERVER_URL).catch(err => log('loadURL error: ' + err.message));

  /*
   * Show the window when the page is ready.  If the page never signals ready
   * (e.g. a slow load, a blank page, a CSP error), force-show after 10 s
   * so the user always sees something rather than a silent failure.
   */
  const readyFallback = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      log('ready-to-show fallback triggered');
      mainWindow.show();
    }
  }, 10000);

  mainWindow.once('ready-to-show', () => {
    clearTimeout(readyFallback);
    mainWindow.show();
  });

  /*
   * Prevent navigation away from the local server
   * (e.g. if a malicious link somehow reaches the window).
   */
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(SERVER_URL)) event.preventDefault();
  });

  /*
   * Open external links in the default OS browser
   * instead of inside the Electron window.
   */
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        require('electron').shell.openExternal(url);
      }
    } catch {}
    return { action: 'deny' };
  });

  /*
   * Content Security Policy enforced at the HTTP level.
   */
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; " +
          "font-src 'self' data:; " +
          `connect-src 'self' ws://localhost:${PORT} http://localhost:${PORT};`
        ]
      }
    });
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ─── IPC Handlers ─────────────────────────────────────────────────────── */

ipcMain.handle('get-version', () => {
  return app.getVersion();
});

/* ─── App Lifecycle ──────────────────────────────────────────────────── */

app.whenReady().then(async () => {
  try {
    log('Starting ChuweyDevPanel (packaged=' + app.isPackaged + ')');
    log('Server script: ' + serverScriptPath());
    log('Public dir: ' + publicDirPath());
    log('Preload script: ' + preloadScriptPath());
    log('Log file: ' + LOG_FILE);

    await startServer();
    createWindow();
  } catch (err) {
    log('Failed to start: ' + err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('will-quit', () => stopServer());

/* ─── Security Hardening ─────────────────────────────────────────────── */

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault());
});
