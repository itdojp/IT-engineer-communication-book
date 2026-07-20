#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const baseUrl = '/IT-engineer-communication-book';
const targetPages = [
  {
    path: '/chapter-stakeholder-communication/',
    selector: '#accessible-consensus-decision',
    labels: ['状態: 高い合意', '状態: 要調整', '状態: 低い合意', 'ステップ1', 'ステップ2', 'ステップ3'],
  },
  {
    path: '/chapter-digital-communication/',
    selector: '#accessible-async-context',
    labels: ['Context Package', 'Thread Management', 'Auto Summary', 'ステップ1', 'ステップ2', 'ステップ3'],
  },
];
const modes = [
  { name: 'desktop-1280', width: 1280, height: 900, mobile: false, pageScale: 1 },
  // Browser zoom reduces the CSS layout viewport. A 640 CSS px viewport is
  // the layout-equivalent of 200% zoom in a 1280 physical-pixel window and
  // is stable across headless Chrome builds (unlike pinch pageScaleFactor).
  { name: 'desktop-200-percent-browser-zoom', width: 640, height: 900, mobile: false, pageScale: 1 },
  { name: 'mobile-320', width: 320, height: 800, mobile: true, pageScale: 1 },
];
const themes = ['light', 'dark'];

function fail(message) {
  throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, 'SIGTERM');
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(3000),
  ]);
  if (child.exitCode === null && child.signalCode === null) {
    signalProcessTree(child, 'SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      sleep(3000),
    ]);
  }
}

function signalProcessTree(child, signal) {
  if (process.platform !== 'win32') {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch (_) {}
  }
  child.kill(signal);
}

async function removeDirectoryWithRetries(directory) {
  let lastError;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      if (!['ENOTEMPTY', 'EBUSY', 'EPERM'].includes(error.code)) throw error;
      await sleep(100 * (attempt + 1));
    }
  }
  throw lastError;
}

function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes('/') && fs.existsSync(candidate)) return candidate;
    if (!candidate.includes('/')) {
      const found = spawnSync('command', ['-v', candidate], { shell: true, encoding: 'utf8' });
      if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
    }
  }
  fail('Chrome/Chromium was not found; set CHROME_BIN');
}

function mimeType(file) {
  const ext = path.extname(file).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  })[ext] || 'application/octet-stream';
}

function startStaticServer(siteDir) {
  const resolvedSite = path.resolve(siteDir);
  const server = http.createServer((request, response) => {
    try {
      let pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (pathname === baseUrl) pathname = '/';
      else if (pathname.startsWith(`${baseUrl}/`)) pathname = pathname.slice(baseUrl.length);
      let relative = pathname.replace(/^\/+/, '');
      if (!relative || relative.endsWith('/')) relative += 'index.html';
      const file = path.resolve(resolvedSite, relative);
      if (file !== resolvedSite && !file.startsWith(`${resolvedSite}${path.sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': mimeType(file), 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(response);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function launchChrome(chrome, userDataDir) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  if (typeof process.getuid === 'function' && process.getuid() === 0) args.unshift('--no-sandbox');
  const child = spawn(chrome, args, {
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: process.platform !== 'win32',
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Chrome DevTools endpoint timed out: ${stderr.slice(-1000)}`));
    }, 15000);
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderr);
      if (match) {
        clearTimeout(timer);
        resolve({ child, browserWebSocketUrl: match[1] });
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (!/DevTools listening on/.test(stderr)) reject(new Error(`Chrome exited ${code}: ${stderr.slice(-1000)}`));
    });
  });
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP WebSocket open timed out')), 10000);
      this.socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP WebSocket failed')); }, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message} (${message.error.code})`));
      else resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close();
  }
}

async function openPage(browserWebSocketUrl, url) {
  const endpoint = new URL(browserWebSocketUrl);
  endpoint.protocol = 'http:';
  endpoint.pathname = '/json/new';
  endpoint.search = `?${encodeURIComponent(url)}`;
  const response = await fetch(endpoint, { method: 'PUT' });
  if (!response.ok) fail(`Chrome new-page endpoint returned ${response.status}`);
  const target = await response.json();
  if (!target.webSocketDebuggerUrl) fail('Chrome did not return a page WebSocket URL');
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  await client.send('Page.enable');
  await client.send('Runtime.enable');
  return { client, targetId: target.id };
}

async function waitForPage(client) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await client.send('Runtime.evaluate', {
      expression: 'document.readyState',
      returnByValue: true,
    });
    if (result.result && result.result.value === 'complete') {
      await client.send('Runtime.evaluate', {
        expression: 'document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()',
        awaitPromise: true,
      });
      await sleep(100);
      return;
    }
    await sleep(50);
  }
  fail('page load timed out');
}

function auditExpression(selector, labels, theme, expectedScale, requireViewportFit) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const labels = ${JSON.stringify(labels)};
    document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});
    const root = document.querySelector(selector);
    if (!root) return { errors: ['target selector missing: ' + selector] };

    function parseColor(value) {
      const match = /rgba?\\(([^)]+)\\)/.exec(value || '');
      if (!match) return null;
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    }
    function composite(fg, bg) {
      const a = fg.a + bg.a * (1 - fg.a);
      if (a === 0) return { r: 255, g: 255, b: 255, a: 1 };
      return {
        r: (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a,
        g: (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a,
        b: (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a,
        a,
      };
    }
    function effectiveBackground(element) {
      let result = { r: 0, g: 0, b: 0, a: 0 };
      for (let current = element; current; current = current.parentElement) {
        const color = parseColor(getComputedStyle(current).backgroundColor);
        if (color && color.a > 0) result = composite(result, color);
        if (result.a >= 0.999) break;
      }
      return result.a >= 0.999 ? result : composite(result, { r: 255, g: 255, b: 255, a: 1 });
    }
    function linear(value) {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    }
    function luminance(color) {
      return 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b);
    }
    function contrast(foreground, background) {
      const a = luminance(foreground);
      const b = luminance(background);
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    }
    function visible(element) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
    }
    function hasOwnText(element) {
      return Array.from(element.childNodes).some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    }

    const errors = [];
    const textMetrics = [];
    for (const element of [root, ...root.querySelectorAll('*')]) {
      if (!visible(element)) continue;
      if (element.scrollWidth > element.clientWidth + 1) {
        errors.push('horizontal overflow: ' + element.tagName.toLowerCase() + '.' + element.className);
      }
      if (!hasOwnText(element)) continue;
      const style = getComputedStyle(element);
      const fontSize = Number.parseFloat(style.fontSize);
      const foreground = parseColor(style.color);
      const background = effectiveBackground(element);
      const ratio = foreground ? contrast(foreground, background) : 0;
      textMetrics.push({ tag: element.tagName.toLowerCase(), fontSize, ratio, text: element.textContent.trim().slice(0, 60) });
      if (fontSize < 16) errors.push('small text ' + fontSize + 'px: ' + element.textContent.trim().slice(0, 60));
      if (ratio < 4.5) errors.push('contrast ' + ratio.toFixed(2) + ':1: ' + element.textContent.trim().slice(0, 60));
    }

    const text = root.innerText;
    for (const label of labels) if (!text.includes(label)) errors.push('visible label missing: ' + label);
    if (!root.querySelector('h4') || !root.querySelector('h5') || !root.querySelector('ol')) {
      errors.push('semantic heading/list structure missing');
    }
    const rect = root.getBoundingClientRect();
    if (${requireViewportFit ? 'true' : 'false'} && (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)) {
      errors.push('target does not fit viewport: left=' + rect.left + ', right=' + rect.right + ', viewport=' + document.documentElement.clientWidth);
    }
    const scale = window.visualViewport ? window.visualViewport.scale : 1;
    if (Math.abs(scale - ${expectedScale}) > 0.05) errors.push('unexpected page scale: ' + scale);
    return {
      errors,
      selector,
      theme: document.documentElement.getAttribute('data-theme'),
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, scale },
      target: { width: rect.width, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth },
      minimumFontSize: Math.min(...textMetrics.map((item) => item.fontSize)),
      minimumContrast: Math.min(...textMetrics.map((item) => item.ratio)),
      textNodeCount: textMetrics.length,
    };
  })()`;
}

async function runAudits(client, origin) {
  const results = [];
  for (const page of targetPages) {
    const url = `${origin}${baseUrl}${page.path}`;
    for (const mode of modes) {
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: mode.width,
        height: mode.height,
        deviceScaleFactor: 1,
        mobile: mode.mobile,
      });
      await client.send('Emulation.setPageScaleFactor', { pageScaleFactor: mode.pageScale });
      await client.send('Page.navigate', { url });
      await waitForPage(client);
      for (const theme of themes) {
        const evaluation = await client.send('Runtime.evaluate', {
          expression: auditExpression(page.selector, page.labels, theme, mode.pageScale, mode.pageScale === 1),
          returnByValue: true,
        });
        if (evaluation.exceptionDetails) fail(`browser evaluation failed: ${evaluation.exceptionDetails.text}`);
        const value = evaluation.result && evaluation.result.value;
        if (!value) fail('browser audit returned no value');
        const result = { page: page.path, mode: mode.name, ...value };
        results.push(result);
        if (value.errors.length > 0) fail(`${page.path} ${mode.name} ${theme}: ${value.errors.join('; ')}`);
      }
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const siteIndex = args.indexOf('--site');
  if (siteIndex < 0 || !args[siteIndex + 1]) fail('usage: check-accessible-content-browser.js --site <built-site> [--json <file>]');
  const siteDir = path.resolve(root, args[siteIndex + 1]);
  if (!fs.existsSync(siteDir)) fail(`built site does not exist: ${siteDir}`);
  const jsonIndex = args.indexOf('--json');
  const jsonFile = jsonIndex >= 0 ? args[jsonIndex + 1] : null;
  if (jsonIndex >= 0 && !jsonFile) fail('--json requires a file');
  const unknown = args.filter((value, index) => !['--site', '--json'].includes(value) && index !== siteIndex + 1 && index !== jsonIndex + 1);
  if (unknown.length > 0) fail(`unknown arguments: ${unknown.join(' ')}`);

  const tempBase = path.join(root, '.codex-local', 'tmp');
  fs.mkdirSync(tempBase, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(tempBase, 'chrome-a11y-'));
  const server = await startStaticServer(siteDir);
  let chromeProcess;
  let browserClient;
  let client;
  try {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const launched = await launchChrome(findChrome(), userDataDir);
    chromeProcess = launched.child;
    browserClient = new CdpClient(launched.browserWebSocketUrl);
    await browserClient.connect();
    const page = await openPage(launched.browserWebSocketUrl, 'about:blank');
    client = page.client;
    const results = await runAudits(client, origin);
    const output = { chrome: findChrome(), checks: results.length, results };
    if (jsonFile) {
      const outputPath = path.resolve(root, jsonFile);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
    }
    const minContrast = Math.min(...results.map((result) => result.minimumContrast));
    const minFont = Math.min(...results.map((result) => result.minimumFontSize));
    console.log(`OK: browser accessibility check passed (${results.length} combinations, minimum font ${minFont}px, minimum contrast ${minContrast.toFixed(2)}:1)`);
  } finally {
    if (client) client.close();
    if (browserClient) {
      try { await browserClient.send('Browser.close'); } catch (_) {}
      browserClient.close();
    }
    await stopProcess(chromeProcess);
    await new Promise((resolve) => server.close(resolve));
    await removeDirectoryWithRetries(userDataDir);
    try { fs.rmdirSync(tempBase); } catch (_) {}
    try { fs.rmdirSync(path.dirname(tempBase)); } catch (_) {}
  }
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
