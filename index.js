/**
 * Host half of the dsh-dualscreen bundle.
 *
 * The pair is two real DSH windows: the main window keeps the conversation and
 * the shipped right sidebar, the native helper window on the other display
 * keeps the left sidebar and the composer. Both sides load the same Web GUI, so
 * the sidebar, composer, model/permission pickers and their menus stay exactly
 * the shipped ones — nothing is cloned or redrawn.
 *
 * The helper window is bound to the main window's session: the main client is
 * the only session owner, it publishes its session here, and the input window
 * follows it through the workspace service. A session the user picks in the
 * input window's sidebar comes back here with source 'prompt' so the main
 * window can follow it. Every publish is stamped with a sequence number, so
 * neither side mistakes its own echo for a request.
 *
 * Routes:
 *   POST /dsh-ds-window/open      { session?, mainDisplay?, promptDisplay? } spawn the input window
 *   POST /dsh-ds-window/close     close it
 *   GET  /dsh-ds-window/status    whether it is open
 *   GET  /dsh-ds-window/session   { id, source, seq } last published session
 *   POST /dsh-ds-window/session   { id, source } publish a session
 *   GET  /dsh-ds-window/displays  connected screens, for the settings pickers
 *   GET  /dsh-ds-window/events    server-sent stream of session publishes
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const inject = ['connection', 'webServer'];

const ROUTE = '/dsh-ds-window';
const HELPER = fileURLToPath(new URL('./helper/main.cjs', import.meta.url));
const DISPLAYS = fileURLToPath(new URL('./helper/displays.ps1', import.meta.url));
const PROFILE = join(tmpdir(), 'dsh-dualscreen-window');

/** Screens, in physical pixels, as Windows reports them. */
let displayCache = { at: 0, list: [] };

function runPowerShell(script, args = [], timeout = 5000) {
  return new Promise((resolve) => {
    try {
      execFile('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args,
      ], { windowsHide: true, timeout }, (error, stdout) => {
        resolve(error ? '' : String(stdout || ''));
      });
    } catch {
      resolve('');
    }
  });
}

async function listDisplays(force) {
  const now = Date.now();
  if (!force && now - displayCache.at < 5000 && displayCache.list.length) return displayCache.list;
  const raw = await runPowerShell(DISPLAYS);
  let list = [];
  try {
    const parsed = JSON.parse(raw.trim() || '{}');
    if (parsed && Array.isArray(parsed.displays)) {
      list = parsed.displays.filter((item) => item && typeof item.device === 'string');
    }
  } catch {
    list = [];
  }
  if (list.length) displayCache = { at: now, list };
  return list;
}

function boundsOf(display) {
  if (!display) return '';
  const x = Number(display.x) || 0;
  const y = Number(display.y) || 0;
  const width = Number(display.width) || 0;
  const height = Number(display.height) || 0;
  if (width <= 0 || height <= 0) return '';
  return [x, y, width, height].join(',');
}

let child = null;
let seq = 0;
let lastSession = { id: '', source: 'flow', seq: 0 };
/** Open SSE responses; every publish is pushed to all of them. */
const listeners = new Set();

/** True while the native input window is alive. */
function childAlive() {
  return Boolean(child && child.exitCode === null);
}

function broadcast(message) {
  const payload = `data: ${JSON.stringify(message)}\n\n`;
  for (const response of listeners) {
    try { response.write(payload); } catch { listeners.delete(response); }
  }
}

function send(res, status, body) {
  try {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  } catch {
    /* response already gone */
  }
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 262144) raw = raw.slice(0, 262144);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function publish(id, source) {
  if (typeof id !== 'string' || id === '') return;
  seq += 1;
  lastSession = { id, source: source === 'prompt' ? 'prompt' : 'flow', seq };
  broadcast({ type: 'session', ...lastSession, open: childAlive() });
}

function electronExe() {
  const explicit = process.env.DSH_DS_ELECTRON_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return join(home, '.dsh', 'electron', 'electron.exe');
}

function promptUrl(connection, web) {
  let origin = '';
  try {
    origin = web.getOrigin();
  } catch {
    /* older/newer WebServer surface */
  }
  if (!origin) origin = `${web.protocol || 'http:'}//127.0.0.1:${String(web.port)}`;
  const url = new URL(connection.authenticatedUrl(origin));
  url.searchParams.set('dshds', 'prompt');
  return url.href;
}

function closeChild() {
  const current = child;
  child = null;
  if (!current || current.exitCode !== null) return;
  try {
    spawn('taskkill', ['/PID', String(current.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } catch {
    try { current.kill(); } catch { /* already gone */ }
  }
}

export function apply(ctx) {
  const connection = ctx.get('connection');
  const web = ctx.get('webServer');
  if (!connection || !web) throw new Error('dsh-dualscreen: connection/webServer unavailable');

  const open = (session, mainBounds, promptBounds) => {
    publish(session, 'flow');
    if (child && child.exitCode === null) return { ok: true, open: true, reused: true };
    const exe = electronExe();
    if (!existsSync(exe)) {
      return {
        ok: false,
        error: `Electron runtime not found at ${exe}. Install dsh-pet (which provides ~/.dsh/electron) or set DSH_DS_ELECTRON_PATH.`,
      };
    }
    mkdirSync(PROFILE, { recursive: true });
    const env = { ...process.env, DSH_DS_URL: promptUrl(connection, web) };
    if (mainBounds) env.DSH_DS_MAIN_BOUNDS = mainBounds;
    else delete env.DSH_DS_MAIN_BOUNDS;
    if (promptBounds) env.DSH_DS_PROMPT_BOUNDS = promptBounds;
    else delete env.DSH_DS_PROMPT_BOUNDS;
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    const spawned = spawn(exe, ['--no-sandbox', `--user-data-dir=${PROFILE}`, HELPER], {
      env,
      stdio: 'ignore',
      windowsHide: false,
    });
    child = spawned;
    const gone = () => {
      if (child !== spawned) return;
      child = null;
      // Push the close so the pair never waits for a poll to notice.
      broadcast({ type: 'status', open: false });
    };
    spawned.on('exit', gone);
    spawned.on('error', gone);
    return { ok: true, open: true, pid: spawned.pid ?? null };
  };

  const handler = async (req, res) => {
    const pathname = String(req.url || '').split('?')[0];
    const action = pathname.slice(ROUTE.length);
    if (action === '/open' && req.method === 'POST') {
      try {
        const body = await readJsonBody(req);
        const screens = await listDisplays(true);
        // Device names come from the settings pickers; an unknown or missing
        // choice falls back to primary / other display.
        const main = screens.find((item) => item.device === body.mainDisplay)
          || screens.find((item) => item.primary)
          || null;
        const prompt = screens.find((item) => item.device === body.promptDisplay)
          || screens.find((item) => !item.primary)
          || main;
        const result = open(
          body && typeof body.session === 'string' ? body.session : '',
          boundsOf(main),
          boundsOf(prompt),
        );
        result.screens = {
          main: main ? main.device : '',
          prompt: prompt ? prompt.device : '',
        };
        send(res, result.ok ? 200 : 500, result);
      } catch (error) {
        send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    if (action === '/events' && req.method === 'GET') {
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 1500\n\n');
      res.write('data: ' + JSON.stringify({ type: 'snapshot', features: ['status'], ...lastSession, open: childAlive() }) + '\n\n');
      listeners.add(res);
      const ping = setInterval(() => {
        try { res.write(': ping\n\n'); } catch { /* gone */ }
      }, 15000);
      const cleanup = () => {
        clearInterval(ping);
        listeners.delete(res);
      };
      req.on('close', cleanup);
      req.on('error', cleanup);
      return;
    }
    if (action === '/displays' && req.method === 'GET') {
      const screens = await listDisplays(true);
      send(res, 200, { ok: true, displays: screens });
      return;
    }
    if (action === '/close' && req.method === 'POST') {
      closeChild();
      broadcast({ type: 'status', open: false });
      send(res, 200, { ok: true, open: false });
      return;
    }
    if (action === '/status' && req.method === 'GET') {
      send(res, 200, { ok: true, open: Boolean(child && child.exitCode === null) });
      return;
    }
    if (action === '/session' && req.method === 'POST') {
      const body = await readJsonBody(req);
      publish(body && typeof body.id === 'string' ? body.id : '', body && body.source);
      send(res, 200, { ok: true, seq: lastSession.seq });
      return;
    }
    if (action === '/session' && req.method === 'GET') {
      send(res, 200, { ok: true, id: lastSession.id, source: lastSession.source, seq: lastSession.seq });
      return;
    }
    send(res, 404, { ok: false, error: 'not found' });
  };

  const dispose = web.register({ kind: 'prefix', path: ROUTE, handler });
  ctx.effect(() => () => {
    try { dispose(); } catch { /* already disposed */ }
    closeChild();
    for (const response of listeners) {
      try { response.end(); } catch { /* gone */ }
    }
    listeners.clear();
  }, 'dsh-dualscreen: prompt window route and helper');
}
