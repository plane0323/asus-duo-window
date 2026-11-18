'use strict';
/**
 * Input-window helper for the ASUS Duo layout plugin.
 *
 * One normal Electron BrowserWindow on the display chosen for the input side
 * (the display that is not the primary one by default), loading the
 * authenticated DSH Web GUI URL in prompt mode. This is a separate process so
 * the DSH desktop shell stays single-window.
 *
 * Opening the pair also parks the DSH main window on its chosen display and
 * maximizes it, so the two windows fill the two screens without the user
 * arranging them by hand.
 */
const { app, BrowserWindow, screen } = require('electron');
const { spawn } = require('node:child_process');
const { join } = require('node:path');

const url = process.env.DSH_DS_URL;

/** Parse "x,y,w,h" (physical pixels) from an env var. */
function parseBounds(value) {
  if (!value) return null;
  const parts = String(value).split(',').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * The Electron display whose physical box matches the Host's Windows-reported
 * bounds. The Host and PowerShell speak physical pixels, Electron speaks DIP.
 */
function displayFor(bounds) {
  if (!bounds) return null;
  let best = null;
  let bestDelta = Infinity;
  for (const display of screen.getAllDisplays()) {
    const scale = display.scaleFactor || 1;
    const delta = Math.abs(display.bounds.x * scale - bounds.x)
      + Math.abs(display.bounds.y * scale - bounds.y)
      + Math.abs(display.bounds.width * scale - bounds.width)
      + Math.abs(display.bounds.height * scale - bounds.height);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = display;
    }
  }
  return bestDelta <= 32 ? best : null;
}

function otherDisplay() {
  const primary = screen.getPrimaryDisplay();
  const displays = screen.getAllDisplays();
  return displays.find((display) => display.id !== primary.id) || primary;
}

/**
 * Move the shell's own window (owned by the desktop process) to its screen.
 * Window messages must come from the same integrity level; this helper is
 * spawned by the Host inside the app, so it is.
 */
function focusMainWindow() {
  try {
    const script = join(__dirname, 'focus-main.ps1');
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', script];
    const mainBounds = process.env.DSH_DS_MAIN_BOUNDS;
    if (mainBounds) args.push('-Bounds', mainBounds);
    spawn('powershell.exe', args, { stdio: 'ignore', windowsHide: true });
  } catch {
    /* the layout still works without the window move */
  }
}

app.whenReady().then(() => {
  focusMainWindow();
  const chosen = displayFor(parseBounds(process.env.DSH_DS_PROMPT_BOUNDS));
  const display = chosen || otherDisplay();
  const { x, y, width, height } = display.bounds;
  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: true,
    show: false,
    backgroundColor: '#151517',
    title: 'DSH 输入窗口',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      preload: join(__dirname, 'preload.cjs'),
    },
  });
  win.setMenuBarVisibility(false);
  win.setAutoHideMenuBar(true);
  // Fill the chosen screen: the window opens on that display, then maximizes.
  win.maximize();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const show = () => {
    if (win.isDestroyed()) return;
    win.show();
    // This window exists to be typed into: the caret belongs here, not in the
    // context window that just opened it.
    win.focus();
  };
  win.once('ready-to-show', show);
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed() && !win.isVisible()) show();
  });
  // A dead Host URL must not leave an orphan window behind on the other
  // display. ERR_ABORTED is a reload/navigation race, not a dead Host.
  win.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
    if (isMainFrame && code !== -3) app.quit();
  });
  win.on('closed', () => app.quit());
  if (!url) {
    win.loadURL('data:text/html,<h1>DSH URL missing</h1>');
  } else {
    win.loadURL(url);
  }
});

app.on('window-all-closed', () => app.quit());
