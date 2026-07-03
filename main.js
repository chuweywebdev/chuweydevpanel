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
let serverRestartCount = 0;
const MAX_SERVER_RESTARTS = 5;

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
    const forkEnv = {
    ...process.env,
    PORT: String(PORT),
    PUBLIC_PATH: publicDirPath()
  };

  if (app.isPackaged) {
    const unpackedModules = path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules');
    if (forkEnv.NODE_PATH) {
      forkEnv.NODE_PATH = [unpackedModules, forkEnv.NODE_PATH].join(path.delimiter);
    } else {
      forkEnv.NODE_PATH = unpackedModules;
    }
  }

  serverProcess = fork(serverScriptPath(), [], {
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    env: forkEnv
  });

    serverProcess.stdout.on('data', (d) => process.stdout.write('[server] ' + d));
    serverProcess.stderr.on('data', (d) => process.stderr.write('[server] ' + d));

    serverProcess.on('error', reject);

    serverProcess.on('exit', (code, signal) => {
      log('Server process exited (code=' + code + ', signal=' + signal + ')');
      serverProcess = null;
      if (code === 0) return;
      if (serverRestartCount < MAX_SERVER_RESTARTS) {
        serverRestartCount++;
        const delay = Math.min(2000 * serverRestartCount, 10000);
        log('Restarting server in ' + delay + 'ms (attempt ' + serverRestartCount + '/' + MAX_SERVER_RESTARTS + ')');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(
            'data:text/html,' + encodeURIComponent(
              '<html><head><style>' +
              'body{background:#1e1e2e;color:#cdd6f4;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}' +
              '.container{text-align:center}' +
              '.spinner{border:4px solid #313244;border-top:4px solid #89b4fa;border-radius:50%;width:40px;height:40px;animation:spin 1s linear infinite;margin:0 auto 16px}' +
              '@keyframes spin{to{transform:rotate(360deg)}}' +
              '</style></head><body>' +
              '<div class="container">' +
              '<div class="spinner"></div>' +
              '<h2 style="color:#89b4fa;margin:0">Reconnecting…</h2>' +
              '<p style="color:#6c7086">Attempt ' + serverRestartCount + '/' + MAX_SERVER_RESTARTS + '</p>' +
              '</div></body></html>'
            )
          ).catch(() => {});
        }
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) startServer()
            .then(() => {
              serverRestartCount = 0;
              log('Server restarted successfully');
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.loadURL(SERVER_URL).catch(() => {});
              }
            })
            .catch((err) => log('Server restart failed: ' + err.message));
        }, delay);
      } else {
        log('Max server restarts reached. Giving up.');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.loadURL(
            'data:text/html,' + encodeURIComponent(
              '<html><head><style>body{background:#1e1e2e;color:#cdd6f4;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.container{text-align:center}button{margin-top:20px;padding:12px 24px;background:#89b4fa;color:#1e1e2e;border:none;border-radius:8px;font-size:16px;cursor:pointer}button:hover{background:#b4d0fb}</style></head><body>' +
              '<div class="container">' +
              '<h1 style="color:#f38ba8">Server Crashed</h1>' +
              '<p>The backend server exited unexpectedly after ' + MAX_SERVER_RESTARTS + ' restart attempts.</p>' +
              '<p style="color:#6c7086;font-size:14px">Check the log file for details:<br>' + LOG_FILE + '</p>' +
              '<button onclick="location.reload()">Restart App</button>' +
              '</div></body></html>'
            )
          ).catch(() => {});
        }
      }
    });

    serverProcess.on('message', (msg) => {
      if (msg && msg.type === 'error') {
        log('Server error: ' + msg.message + (msg.stack ? '\n' + msg.stack : ''));
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
      const allowed = new Set([
        'www.facebook.com',
      ]);
      if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && allowed.has(parsed.hostname)) {
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
