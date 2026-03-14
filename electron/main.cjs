const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');

const DEFAULT_UI_PORT = 4310;
const DEFAULT_GATEWAY_HOST = process.env.OPENCLAW_GATEWAY_HOST || '127.0.0.1';
const DEFAULT_GATEWAY_PORT = Number(process.env.OPENCLAW_GATEWAY_PORT || 18789);
const ICONS_DIR = path.resolve(__dirname, '..', 'assets');

const BOOTSTRAP_CACHE_DIR = path.resolve(__dirname, '..', '.cache');
const BOOTSTRAP_STATE_FILE = path.join(BOOTSTRAP_CACHE_DIR, 'upstream-bootstrap-state.json');
const UPSTREAM_UI_PID_FILE = path.join(BOOTSTRAP_CACHE_DIR, 'upstream-ui.pid');
const UPSTREAM_UI_PORT_FILE = path.join(BOOTSTRAP_CACHE_DIR, 'upstream-ui.port');

const NPM_EXEC_ENV = {
  npm_config_registry: process.env.npm_config_registry || 'https://registry.npmjs.org/',
  ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
  electron_mirror: process.env.electron_mirror || 'https://npmmirror.com/mirrors/electron/',
  ELECTRON_BUILDER_BINARIES_MIRROR:
    process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
    'https://npmmirror.com/mirrors/electron-builder-binaries/'
};

let uiProcess;
let uiSpawnedByDesktop = false;
let activeUiPort = null;
let mainWindow;
let isQuitting = false;

function safeStat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function pathExists(filePath) {
  return safeStat(filePath) !== null;
}

function pickFirstExisting(paths) {
  for (const candidate of paths) {
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getAppIconPath() {
  if (process.platform === 'win32') {
    return pickFirstExisting([
      path.join(ICONS_DIR, 'windows', 'icon.ico'),
      path.join(ICONS_DIR, 'windows', '256x256.png'),
      path.join(ICONS_DIR, 'icon.png')
    ]);
  }

  if (process.platform === 'darwin') {
    return pickFirstExisting([
      path.join(ICONS_DIR, 'macos', 'icon.icns'),
      path.join(ICONS_DIR, 'macos', '512x512.png'),
      path.join(ICONS_DIR, 'icon.png')
    ]);
  }

  return pickFirstExisting([
    path.join(ICONS_DIR, 'linux', 'icons', '512x512.png'),
    path.join(ICONS_DIR, 'icon.png')
  ]);
}

function readBootstrapState() {
  try {
    if (!pathExists(BOOTSTRAP_STATE_FILE)) {
      return null;
    }
    return JSON.parse(fs.readFileSync(BOOTSTRAP_STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeBootstrapState(state) {
  fs.mkdirSync(BOOTSTRAP_CACHE_DIR, { recursive: true });
  fs.writeFileSync(BOOTSTRAP_STATE_FILE, JSON.stringify(state, null, 2));
}

function readNumberFromFile(filePath) {
  try {
    if (!pathExists(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function writeNumberToFile(filePath, value) {
  fs.mkdirSync(BOOTSTRAP_CACHE_DIR, { recursive: true });
  fs.writeFileSync(filePath, String(value));
}

function removeFileIfExists(filePath) {
  try {
    if (pathExists(filePath)) {
      fs.rmSync(filePath, { force: true });
    }
  } catch {
    // ignore
  }
}

function isPidAlive(pid) {
  if (!pid) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function latestMtimeMs(dirPath) {
  const stat = safeStat(dirPath);
  if (!stat || !stat.isDirectory()) {
    return 0;
  }

  let maxMtime = stat.mtimeMs;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const nestedMtime = latestMtimeMs(fullPath);
      if (nestedMtime > maxMtime) {
        maxMtime = nestedMtime;
      }
      continue;
    }

    const entryStat = safeStat(fullPath);
    if (entryStat && entryStat.mtimeMs > maxMtime) {
      maxMtime = entryStat.mtimeMs;
    }
  }

  return maxMtime;
}

function readUpstreamHead(upstreamDir) {
  const result = spawnSync('git', ['-C', upstreamDir, 'rev-parse', 'HEAD'], {
    encoding: 'utf8',
    shell: process.platform === 'win32'
  });

  if (result.status === 0 && typeof result.stdout === 'string') {
    return result.stdout.trim();
  }

  return 'unknown';
}

function buildUpstreamFingerprints(upstreamDir) {
  const packageJsonPath = path.join(upstreamDir, 'package.json');
  const packageLockPath = path.join(upstreamDir, 'package-lock.json');
  const tsConfigPath = path.join(upstreamDir, 'tsconfig.json');
  const srcDir = path.join(upstreamDir, 'src');
  const distDir = path.join(upstreamDir, 'dist');

  const packageJsonStat = safeStat(packageJsonPath);
  const packageLockStat = safeStat(packageLockPath);
  const tsConfigStat = safeStat(tsConfigPath);
  const srcLatest = latestMtimeMs(srcDir);
  const hasNodeModules = pathExists(path.join(upstreamDir, 'node_modules'));
  const hasDist = pathExists(distDir);
  const upstreamHead = readUpstreamHead(upstreamDir);

  const installFingerprint = [
    upstreamHead,
    packageJsonStat?.mtimeMs || 0,
    packageJsonStat?.size || 0,
    packageLockStat?.mtimeMs || 0,
    packageLockStat?.size || 0
  ].join('|');

  const buildFingerprint = [
    installFingerprint,
    tsConfigStat?.mtimeMs || 0,
    tsConfigStat?.size || 0,
    srcLatest
  ].join('|');

  return {
    hasNodeModules,
    hasDist,
    upstreamHead,
    installFingerprint,
    buildFingerprint
  };
}

function getNpmCommand() {
  return 'npm';
}

function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(getNpmCommand(), args, {
      cwd: options.cwd,
      env: { ...process.env, ...NPM_EXEC_ENV, ...(options.env || {}) },
      stdio: 'pipe',
      shell: process.platform === 'win32'
    });

    if (child.stdout) {
      child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    }

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command npm ${args.join(' ')} failed with code ${code}`));
    });
  });
}

function checkPortOpen(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (open) => {
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function findAvailablePort(startPort, host = '127.0.0.1', maxAttempts = 50) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = startPort + i;
    const inUse = await checkPortOpen(host, candidate);
    if (!inUse) {
      return candidate;
    }
  }

  return null;
}

function waitForUi(url, timeoutMs = 60000, intervalMs = 1000) {
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });

      req.on('error', retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(probe, intervalMs);
    };

    probe();
  });
}

function ensureEnv(upstreamDir) {
  const envPath = path.join(upstreamDir, '.env');
  const envExample = path.join(upstreamDir, '.env.example');

  if (!pathExists(envPath) && pathExists(envExample)) {
    fs.copyFileSync(envExample, envPath);
  }
}

function ensureUpstreamDir() {
  const rootDir = path.resolve(__dirname, '..');
  const upstreamDir = path.join(rootDir, 'upstream');
  const packageJsonPath = path.join(upstreamDir, 'package.json');

  if (!pathExists(upstreamDir) || !pathExists(packageJsonPath)) {
    throw new Error(
      'Missing upstream source. Run `git submodule update --init --recursive` and `npm run sync:upstream` first.'
    );
  }

  return upstreamDir;
}

function killProcessTree(pid) {
  if (!pid) {
    return;
  }

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      shell: true
    });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
}

function killProcessOnPort(port) {
  if (!port) {
    return;
  }

  if (process.platform === 'win32') {
    const script =
      `$port=${Number(port)};` +
      '$pids=(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ' +
      'Select-Object -ExpandProperty OwningProcess -Unique);' +
      'foreach($pid in $pids){try{Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue}catch{}}';
    spawnSync('powershell', ['-NoProfile', '-Command', script], {
      stdio: 'ignore',
      shell: true
    });
    return;
  }

  if (process.platform === 'darwin') {
    spawnSync('sh', ['-lc', `lsof -ti tcp:${Number(port)} | xargs kill -9 >/dev/null 2>&1 || true`], {
      stdio: 'ignore'
    });
    return;
  }

  spawnSync('sh', ['-lc', `fuser -k ${Number(port)}/tcp >/dev/null 2>&1 || true`], {
    stdio: 'ignore'
  });
}

function clearOwnedUiMarkers() {
  removeFileIfExists(UPSTREAM_UI_PID_FILE);
  removeFileIfExists(UPSTREAM_UI_PORT_FILE);
}

function cleanupOwnedUiProcessFromPreviousRun() {
  const ownedPid = readNumberFromFile(UPSTREAM_UI_PID_FILE);
  const ownedPort = readNumberFromFile(UPSTREAM_UI_PORT_FILE);

  if (ownedPid && isPidAlive(ownedPid)) {
    console.log(`[desktop] Cleaning stale upstream UI process PID ${ownedPid} from previous run...`);
    killProcessTree(ownedPid);
  }

  if (ownedPort) {
    killProcessOnPort(ownedPort);
  }

  clearOwnedUiMarkers();
}

function stopUiProcessIfOwned() {
  if (uiSpawnedByDesktop && uiProcess?.pid) {
    killProcessTree(uiProcess.pid);
  }

  if (activeUiPort) {
    killProcessOnPort(activeUiPort);
  }

  uiProcess = undefined;
  uiSpawnedByDesktop = false;
  activeUiPort = null;
  clearOwnedUiMarkers();
}

function spawnUiProcess(upstreamDir, uiPort) {
  uiProcess = spawn(getNpmCommand(), ['run', 'dev'], {
    cwd: upstreamDir,
    env: { ...process.env, ...NPM_EXEC_ENV, UI_MODE: 'true', UI_PORT: String(uiPort) },
    stdio: 'pipe',
    shell: process.platform === 'win32',
    detached: false
  });

  if (uiProcess.stdout) {
    uiProcess.stdout.on('data', (chunk) => process.stdout.write(chunk));
  }

  if (uiProcess.stderr) {
    uiProcess.stderr.on('data', (chunk) => process.stderr.write(chunk));
  }

  uiSpawnedByDesktop = true;
  activeUiPort = uiPort;

  if (uiProcess.pid) {
    writeNumberToFile(UPSTREAM_UI_PID_FILE, uiProcess.pid);
  }
  writeNumberToFile(UPSTREAM_UI_PORT_FILE, uiPort);

  uiProcess.on('exit', (code, signal) => {
    uiProcess = undefined;
    uiSpawnedByDesktop = false;
    activeUiPort = null;
    clearOwnedUiMarkers();

    if (!isQuitting && code !== 0) {
      dialog.showErrorBox(
        'OpenClaw UI exited unexpectedly',
        `UI process exited with code ${code ?? 'unknown'} signal ${signal ?? 'none'}.`
      );
      isQuitting = true;
      app.quit();
    }
  });
}

async function createMainWindow(uiUrl) {
  const appIconPath = getAppIconPath();
  const win = new BrowserWindow({
    width: 1400,
    height: 920,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    icon: appIconPath || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow = win;

  win.on('close', () => {
    isQuitting = true;
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  await win.loadFile(path.join(__dirname, 'shell', 'index.html'), {
    query: {
      ui: uiUrl
    }
  });
}

async function bootstrap() {
  cleanupOwnedUiProcessFromPreviousRun();

  console.log('[desktop] Checking OpenClaw gateway...');
  const gatewayOk = await checkPortOpen(DEFAULT_GATEWAY_HOST, DEFAULT_GATEWAY_PORT);
  if (!gatewayOk) {
    throw new Error(
      `OpenClaw gateway is not reachable at ${DEFAULT_GATEWAY_HOST}:${DEFAULT_GATEWAY_PORT}.`
    );
  }

  const upstreamDir = ensureUpstreamDir();
  ensureEnv(upstreamDir);

  const uiPort = await findAvailablePort(DEFAULT_UI_PORT);
  if (!uiPort) {
    throw new Error('No available local UI port found starting from 4310.');
  }

  const bootstrapState = readBootstrapState();
  const fingerprints = buildUpstreamFingerprints(upstreamDir);
  const shouldInstall =
    !fingerprints.hasNodeModules ||
    bootstrapState?.installFingerprint !== fingerprints.installFingerprint;
  const shouldBuild =
    !fingerprints.hasDist ||
    shouldInstall ||
    bootstrapState?.buildFingerprint !== fingerprints.buildFingerprint;

  if (shouldInstall) {
    console.log('[desktop] Installing upstream dependencies...');
    await runCommand(['install'], { cwd: upstreamDir });
  } else {
    console.log('[desktop] Upstream dependencies unchanged, skipping install.');
  }

  if (shouldBuild) {
    console.log('[desktop] Building upstream...');
    await runCommand(['run', 'build'], { cwd: upstreamDir });
  } else {
    console.log('[desktop] Upstream source unchanged, skipping build.');
  }

  writeBootstrapState({
    installFingerprint: fingerprints.installFingerprint,
    buildFingerprint: fingerprints.buildFingerprint,
    upstreamHead: fingerprints.upstreamHead,
    updatedAt: new Date().toISOString()
  });

  console.log(`[desktop] Starting upstream UI on port ${uiPort}...`);
  spawnUiProcess(upstreamDir, uiPort);

  const healthUrl = `http://127.0.0.1:${uiPort}/healthz`;
  const uiUrl = `http://127.0.0.1:${uiPort}/?section=overview&lang=zh`;
  console.log(`[desktop] Waiting for UI health endpoint on ${uiPort}...`);
  await waitForUi(healthUrl);
  console.log('[desktop] UI is ready, opening Electron window...');
  await createMainWindow(uiUrl);
}

app.whenReady().then(async () => {
  const appIconPath = getAppIconPath();
  if (process.platform === 'darwin' && appIconPath && app.dock) {
    app.dock.setIcon(appIconPath);
  }

  ipcMain.handle('desktop:get-window-state', () => ({
    isMaximized: Boolean(mainWindow && mainWindow.isMaximized())
  }));

  ipcMain.on('desktop:window-action', (_event, action) => {
    if (!mainWindow) {
      return;
    }

    if (action === 'minimize') {
      mainWindow.minimize();
      return;
    }

    if (action === 'toggle-maximize') {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
      return;
    }

    if (action === 'close') {
      isQuitting = true;
      app.quit();
    }
  });

  try {
    await bootstrap();
  } catch (error) {
    console.error('[desktop] Startup failed:', error);
    dialog.showErrorBox('Desktop startup failed', error.message);
    isQuitting = true;
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (isQuitting) {
    stopUiProcessIfOwned();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopUiProcessIfOwned();
});

app.on('quit', () => {
  stopUiProcessIfOwned();
});
