#!/usr/bin/env node
'use strict';

const fs = require('fs');
const dns = require('dns');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultConfigPath = path.join(root, '.external-link-monitor.json');
const categoryOrder = ['success', 'redirect', 'permanent', 'transient', 'restricted', 'policy-error', 'ignored'];
const requiredNextReadUrls = [
  'https://itdojp.github.io/ai-communication-book/',
  'https://itdojp.github.io/negotiation-for-engineers-book/',
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/') || '.';
}

function normalizeUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new Error(`invalid URL ${JSON.stringify(value)}: ${error.message}`);
  }
  invariant(['http:', 'https:'].includes(parsed.protocol), `unsupported URL protocol: ${value}`);
  parsed.hash = '';
  return parsed.href;
}

function withoutCode(markdown) {
  let fence = null;
  return markdown.split(/\r?\n/).map((line) => {
    const opening = line.match(/^\s*(`{3,}|~{3,})/);
    if (opening) {
      const marker = opening[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return '';
    }
    if (fence !== null) return '';
    return line.replace(/`[^`]*`/g, (match) => ' '.repeat(match.length));
  }).join('\n');
}

function isPrivateHostname(value) {
  const hostname = value.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4) {
    const octets = hostname.split('.').map(Number);
    return octets[0] === 0
      || octets[0] === 10
      || octets[0] === 127
      || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
      || (octets[0] === 169 && octets[1] === 254)
      || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
      || (octets[0] === 192 && octets[1] === 168)
      || octets[0] >= 224;
  }
  if (ipVersion === 6) {
    return hostname === '::1' || hostname === '::' || hostname.startsWith('::ffff:') || /^(fc|fd|fe8|fe9|fea|feb)/.test(hostname);
  }
  return false;
}

function isPrivateTarget(url) {
  return isPrivateHostname(new URL(url).hostname);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (text.charCodeAt(offset) === 10) line += 1;
  }
  return line;
}

function isEscaped(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

function openingLabelBracket(text, closingIndex) {
  let nested = 0;
  for (let index = closingIndex - 1; index >= 0; index -= 1) {
    if (isEscaped(text, index)) continue;
    if (text[index] === ']') nested += 1;
    if (text[index] === '[') {
      if (nested === 0) return index;
      nested -= 1;
    }
  }
  return -1;
}

function unescapeMarkdownDestination(value) {
  return value.replace(/\\([!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~-])/g, '$1');
}

function extractInlineMarkdownLinks(text) {
  const links = [];
  for (let closingLabel = 0; closingLabel < text.length - 1; closingLabel += 1) {
    if (text[closingLabel] !== ']' || text[closingLabel + 1] !== '(' || isEscaped(text, closingLabel)) continue;
    const openingLabel = openingLabelBracket(text, closingLabel);
    if (openingLabel < 0) continue;
    let cursor = closingLabel + 2;
    while (/[ \t\n]/.test(text[cursor] || '')) cursor += 1;
    let destination = '';
    let closingLink = -1;
    if (text[cursor] === '<') {
      cursor += 1;
      while (cursor < text.length) {
        if (text[cursor] === '>' && !isEscaped(text, cursor)) {
          cursor += 1;
          break;
        }
        destination += text[cursor];
        cursor += 1;
      }
    } else {
      let depth = 0;
      while (cursor < text.length) {
        const character = text[cursor];
        if (character === '\\' && cursor + 1 < text.length) {
          destination += `${character}${text[cursor + 1]}`;
          cursor += 2;
          continue;
        }
        if (character === '(') {
          depth += 1;
          destination += character;
          cursor += 1;
          continue;
        }
        if (character === ')') {
          if (depth === 0) {
            closingLink = cursor;
            break;
          }
          depth -= 1;
          destination += character;
          cursor += 1;
          continue;
        }
        if (/\s/.test(character) && depth === 0) break;
        destination += character;
        cursor += 1;
      }
    }
    if (closingLink < 0) {
      let quote = null;
      let titleDepth = 0;
      for (; cursor < text.length; cursor += 1) {
        const character = text[cursor];
        if (character === '\\') {
          cursor += 1;
          continue;
        }
        if (quote) {
          if (character === quote) quote = null;
          continue;
        }
        if (character === '"' || character === "'") {
          quote = character;
          continue;
        }
        if (character === '(') titleDepth += 1;
        else if (character === ')' && titleDepth > 0) titleDepth -= 1;
        else if (character === ')' && titleDepth === 0) {
          closingLink = cursor;
          break;
        }
      }
    }
    if (closingLink < 0 || !/^https?:\/\//i.test(destination)) continue;
    links.push({ url: normalizeUrl(unescapeMarkdownDestination(destination)), line: lineNumberAt(text, closingLabel), start: openingLabel, end: closingLink + 1 });
    closingLabel = closingLink;
  }
  return links;
}

function extractHttpLinks(markdown) {
  const text = withoutCode(markdown);
  const matches = [];
  const definitions = new Map();
  const definitionRanges = [];
  const definitionPattern = /^[ \t]{0,3}\[([^\]]+)\]:\s*(?:<([^>]+)>|(\S+))(?:\s+.*)?$/gm;
  const normalizeLabel = (label) => label.trim().replace(/\s+/g, ' ').toLowerCase();
  for (const match of text.matchAll(definitionPattern)) {
    const label = normalizeLabel(match[1]);
    invariant(!definitions.has(label), `duplicate Markdown reference definition: ${match[1]}`);
    definitions.set(label, { url: normalizeUrl(match[2] || match[3]), index: match.index });
    definitionRanges.push([match.index, match.index + match[0].length]);
  }

  const referenceText = [...text];
  for (const match of text.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const definition = definitions.get(normalizeLabel(match[2] || match[1]));
    if (definition) matches.push({ url: definition.url, line: lineNumberAt(text, match.index) });
    for (let index = match.index; index < match.index + match[0].length; index += 1) referenceText[index] = ' ';
  }
  const shortcutText = referenceText.join('');
  for (const match of shortcutText.matchAll(/!?\[([^\]]+)\](?![\[(:])/g)) {
    const definition = definitions.get(normalizeLabel(match[1]));
    if (definition) matches.push({ url: definition.url, line: lineNumberAt(shortcutText, match.index) });
  }

  const directText = [...text];
  for (const [start, end] of definitionRanges) {
    for (let index = start; index < end; index += 1) {
      if (directText[index] !== '\n') directText[index] = ' ';
    }
  }
  const directMarkdown = directText.join('');
  const inlineLinks = extractInlineMarkdownLinks(directMarkdown);
  matches.push(...inlineLinks.map(({ url, line }) => ({ url, line })));
  const remainingText = [...directMarkdown];
  for (const link of inlineLinks) {
    for (let index = link.start; index < link.end; index += 1) {
      if (remainingText[index] !== '\n') remainingText[index] = ' ';
    }
  }
  const remainingMarkdown = remainingText.join('');
  const patterns = [
    /<(https?:\/\/[^>\s]+)>/g,
    /<a\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
  ];
  for (const pattern of patterns) {
    for (const match of remainingMarkdown.matchAll(pattern)) {
      matches.push({ url: normalizeUrl(match[1]), line: lineNumberAt(remainingMarkdown, match.index) });
    }
  }
  return matches.sort((left, right) => left.line - right.line || left.url.localeCompare(right.url));
}

function markdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(fullPath);
  }
  return files.sort();
}

function readConfig(configPath) {
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new Error(`failed to read monitor config ${relative(configPath)}: ${error.message}`);
  }
  invariant(Array.isArray(config.sourceRoots) && config.sourceRoots.length > 0, 'config.sourceRoots must be a non-empty array');
  invariant(Array.isArray(config.requiredUrls), 'config.requiredUrls must be an array');
  invariant(Array.isArray(config.ignore), 'config.ignore must be an array');
  const request = config.request || {};
  for (const key of ['timeoutMs', 'retries', 'retryDelayMs', 'concurrency', 'maxRedirects']) {
    invariant(Number.isInteger(request[key]) && request[key] >= 0, `config.request.${key} must be a non-negative integer`);
  }
  invariant(request.timeoutMs > 0, 'config.request.timeoutMs must be greater than zero');
  invariant(request.concurrency > 0, 'config.request.concurrency must be greater than zero');
  invariant(typeof request.allowHttpsToHttp === 'boolean', 'config.request.allowHttpsToHttp must be boolean');
  invariant(typeof request.allowPrivateTargets === 'boolean', 'config.request.allowPrivateTargets must be boolean');
  invariant(Array.isArray(request.httpsToHttpAllowlist), 'config.request.httpsToHttpAllowlist must be an array');
  invariant(typeof request.userAgent === 'string' && request.userAgent.trim(), 'config.request.userAgent must be non-empty');
  const httpsToHttpAllowlist = request.httpsToHttpAllowlist.map((entry, index) => {
    invariant(entry && typeof entry === 'object', `config.request.httpsToHttpAllowlist[${index}] must be an object`);
    invariant(typeof entry.reason === 'string' && entry.reason.trim(), `config.request.httpsToHttpAllowlist[${index}].reason must be non-empty`);
    return { url: normalizeUrl(entry.url), reason: entry.reason.trim() };
  });
  return {
    ...config,
    request: { ...request, httpsToHttpAllowlist },
    requiredUrls: config.requiredUrls.map(normalizeUrl),
    ignore: config.ignore.map((entry, index) => {
      invariant(entry && typeof entry === 'object', `config.ignore[${index}] must be an object`);
      invariant(typeof entry.reason === 'string' && entry.reason.trim(), `config.ignore[${index}].reason must be non-empty`);
      invariant(/^\d{4}-\d{2}-\d{2}$/.test(entry.expires || ''), `config.ignore[${index}].expires must use YYYY-MM-DD`);
      return { url: normalizeUrl(entry.url), reason: entry.reason.trim(), expires: entry.expires };
    }),
  };
}

function buildInventory(config, configRoot = root) {
  const inventory = new Map();
  const sourceFiles = [];
  for (const sourceRoot of config.sourceRoots) {
    const resolvedRoot = path.resolve(configRoot, sourceRoot);
    const allowedPrefix = `${path.resolve(configRoot)}${path.sep}`;
    invariant(resolvedRoot.startsWith(allowedPrefix), `source root escapes repository: ${sourceRoot}`);
    invariant(fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory(), `source root is missing: ${sourceRoot}`);
    for (const filePath of markdownFiles(resolvedRoot)) {
      sourceFiles.push(filePath);
      for (const link of extractHttpLinks(fs.readFileSync(filePath, 'utf8'))) {
        invariant(config.request.allowPrivateTargets || !isPrivateTarget(link.url), `private/loopback external URL is not allowed: ${link.url}`);
        if (!inventory.has(link.url)) inventory.set(link.url, { url: link.url, occurrences: [] });
        inventory.get(link.url).occurrences.push({ source: path.relative(configRoot, filePath).split(path.sep).join('/'), line: link.line });
      }
    }
  }
  for (const requiredUrl of config.requiredUrls) {
    invariant(inventory.has(requiredUrl), `required external URL is missing from canonical Markdown: ${requiredUrl}`);
  }
  return {
    sourceFiles: [...new Set(sourceFiles)].sort(),
    links: [...inventory.values()].sort((left, right) => left.url.localeCompare(right.url)),
  };
}

function validateIgnores(config, inventory, today = new Date().toISOString().slice(0, 10)) {
  const urls = new Set(inventory.links.map((link) => link.url));
  const downgradeUrls = new Set();
  for (const entry of config.request.httpsToHttpAllowlist) {
    invariant(!downgradeUrls.has(entry.url), `duplicate HTTPS-to-HTTP allowlist entry: ${entry.url}`);
    invariant(urls.has(entry.url), `HTTPS-to-HTTP allowlist entry does not match a canonical external link: ${entry.url}`);
    downgradeUrls.add(entry.url);
  }
  const ignores = new Map();
  for (const entry of config.ignore) {
    invariant(!ignores.has(entry.url), `duplicate ignore entry: ${entry.url}`);
    invariant(urls.has(entry.url), `ignore entry does not match a canonical external link: ${entry.url}`);
    invariant(entry.expires >= today, `ignore entry expired on ${entry.expires}: ${entry.url}`);
    ignores.set(entry.url, entry);
  }
  return ignores;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function publicLookup(hostname, options, callback) {
  const lookupOptions = typeof options === 'number' ? { family: options } : { ...(options || {}) };
  dns.lookup(hostname, { family: lookupOptions.family || 0, hints: lookupOptions.hints || 0, all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length) return callback(new Error(`DNS returned no addresses for ${hostname}`));
    const privateAddress = addresses.find((entry) => isPrivateHostname(entry.address));
    if (privateAddress) {
      const policyError = new Error(`hostname ${hostname} resolved to private/loopback address ${privateAddress.address}`);
      policyError.code = 'PRIVATE_TARGET';
      return callback(policyError);
    }
    const selected = addresses[0];
    if (lookupOptions.all) return callback(null, addresses);
    return callback(null, selected.address, selected.family);
  });
}

function requestHeaders(url, request) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    let settled = false;
    const options = {
      method: 'GET',
      agent: false,
      headers: {
        'user-agent': request.userAgent,
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    };
    if (!request.allowPrivateTargets) options.lookup = publicLookup;
    const outgoing = client.request(parsed, options, (response) => {
      settled = true;
      clearTimeout(timer);
      const result = { status: response.statusCode, headers: response.headers };
      response.destroy();
      resolve(result);
    });
    const timer = setTimeout(() => {
      const error = new Error('timeout');
      error.code = 'ETIMEDOUT';
      outgoing.destroy(error);
    }, request.timeoutMs);
    outgoing.on('error', (error) => {
      clearTimeout(timer);
      if (!settled) reject(error);
    });
    outgoing.end();
  });
}

async function requestOnce(url, request) {
  let current = url;
  const redirects = [];
  const downgradeAllowed = request.allowHttpsToHttp || (request.httpsToHttpAllowlist || []).some((entry) => entry.url === url);
  for (;;) {
    let response;
    try {
      response = await requestHeaders(current, request);
    } catch (error) {
      if (error.code === 'PRIVATE_TARGET') return { policyError: error.message, finalUrl: current, redirects };
      return { transportError: error.code === 'ETIMEDOUT' ? 'timeout' : error.message, finalUrl: current, redirects };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) return { policyError: `redirect ${response.status} has no Location header`, status: response.status, finalUrl: current, redirects };
      if (redirects.length >= request.maxRedirects) {
        return { policyError: `redirect limit ${request.maxRedirects} exceeded`, status: response.status, finalUrl: current, redirects };
      }
      const next = new URL(location, current);
      if (!['http:', 'https:'].includes(next.protocol)) {
        return { policyError: `redirect uses unsupported protocol ${next.protocol}`, status: response.status, finalUrl: current, redirects };
      }
      if (!request.allowPrivateTargets && isPrivateTarget(next.href)) {
        return { policyError: `redirect targets a private/loopback address: ${next.href}`, status: response.status, finalUrl: current, redirects };
      }
      if (!downgradeAllowed && new URL(current).protocol === 'https:' && next.protocol === 'http:') {
        return { policyError: 'HTTPS-to-HTTP redirect is not allowed', status: response.status, finalUrl: current, redirects };
      }
      redirects.push({ status: response.status, from: current, to: next.href });
      current = next.href;
      continue;
    }

    return { status: response.status, finalUrl: current, redirects };
  }
}

function classify(attempt) {
  if (attempt.policyError) return 'policy-error';
  if (attempt.transportError) return 'transient';
  if (attempt.status >= 200 && attempt.status < 300) return attempt.redirects.length ? 'redirect' : 'success';
  if ([404, 410].includes(attempt.status)) return 'permanent';
  if ([408, 425, 429].includes(attempt.status) || attempt.status >= 500) return 'transient';
  if (attempt.status >= 400 && attempt.status < 500) return 'restricted';
  return 'policy-error';
}

async function probe(link, request) {
  const attempts = [];
  for (let index = 0; index <= request.retries; index += 1) {
    const attempt = await requestOnce(link.url, request);
    attempt.category = classify(attempt);
    attempts.push(attempt);
    if (attempt.category !== 'transient' || index === request.retries) break;
    await sleep(request.retryDelayMs * (2 ** index));
  }
  const last = attempts[attempts.length - 1];
  return { ...link, category: last.category, status: last.status || null, finalUrl: last.finalUrl, redirects: last.redirects, attempts };
}

async function mapLimit(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function summarize(results) {
  const categories = Object.fromEntries(categoryOrder.map((category) => [category, 0]));
  for (const result of results) categories[result.category] += 1;
  const findingCount = categories.permanent + categories['policy-error'];
  return { categories, findingCount, exitCode: findingCount > 0 ? 1 : 0 };
}

async function monitor(config, inventory) {
  const ignores = validateIgnores(config, inventory);
  const ignored = [];
  const active = [];
  for (const link of inventory.links) {
    if (ignores.has(link.url)) {
      ignored.push({ ...link, category: 'ignored', ignore: ignores.get(link.url), attempts: [] });
    } else {
      active.push(link);
    }
  }
  const probed = await mapLimit(active, config.request.concurrency, (link) => probe(link, config.request));
  const results = [...probed, ...ignored].sort((left, right) => left.url.localeCompare(right.url));
  return { results, summary: summarize(results) };
}

function markdownReport(report) {
  if (report.infrastructureError) {
    return [
      '# External link monitor',
      '',
      `- Generated: ${report.generatedAt}`,
      '- Result: infrastructure/configuration failure',
      `- Error: ${String(report.infrastructureError).replace(/\|/g, '%7C')}`,
      '',
    ].join('\n');
  }
  const lines = [
    '# External link monitor',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Canonical Markdown files: ${report.sourceFileCount}`,
    `- Unique URLs: ${report.uniqueUrlCount}`,
    `- Duplicate URLs: ${report.duplicateUrlCount}`,
    `- Result: ${report.exitCode === 0 ? 'no permanent findings' : 'permanent/policy findings detected'}`,
    '',
    '| Category | Count |',
    '|---|---:|',
    ...categoryOrder.map((category) => `| ${category} | ${report.summary.categories[category]} |`),
    '',
    '| Category | Status | Attempts | URL |',
    '|---|---:|---:|---|',
    ...report.results.map((result) => `| ${result.category} | ${result.status || '-'} | ${result.attempts.length} | ${result.url.replace(/\|/g, '%7C')} |`),
    '',
    'Transient/restricted results are evidence for re-check and do not make this scheduled monitor fail. Permanent 404/410 and redirect-policy findings return exit code 1; monitor infrastructure/configuration errors return exit code 2.',
    '',
  ];
  return lines.join('\n');
}

function writeReports(options, report) {
  if (options.json) {
    fs.mkdirSync(path.dirname(options.json), { recursive: true });
    fs.writeFileSync(options.json, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.markdown) {
    fs.mkdirSync(path.dirname(options.markdown), { recursive: true });
    fs.writeFileSync(options.markdown, markdownReport(report));
  }
}

function parseArgs(argv) {
  const options = { config: defaultConfigPath, json: null, markdown: null, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--self-test') {
      options.selfTest = true;
      continue;
    }
    invariant(['--config', '--json', '--markdown'].includes(argument), `unknown argument: ${argument}`);
    const value = argv[index + 1];
    invariant(value && !value.startsWith('--'), `${argument} requires a path`);
    options[argument.slice(2)] = path.resolve(root, value);
    index += 1;
  }
  return options;
}

function createFixtureServer() {
  const counters = new Map();
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    counters.set(pathname, (counters.get(pathname) || 0) + 1);
    if (pathname === '/ok' || pathname === '/reference' || pathname === '/report_(final)' || pathname === '/angle') response.writeHead(200).end('ok');
    else if (pathname === '/redirect') response.writeHead(302, { location: '/ok' }).end();
    else if (pathname === '/retry' && counters.get(pathname) === 1) response.writeHead(503).end('retry');
    else if (pathname === '/retry') response.writeHead(200).end('recovered');
    else if (pathname === '/not-found') response.writeHead(404).end('missing');
    else if (pathname === '/gone') response.writeHead(410).end('gone');
    else response.writeHead(503).end('transient');
  });
  return { server, counters };
}

function validateTrackedContract() {
  const config = readConfig(defaultConfigPath);
  const inventory = buildInventory(config);
  validateIgnores(config, inventory);
  for (const url of requiredNextReadUrls.map(normalizeUrl)) {
    invariant(config.requiredUrls.includes(url), `tracked config is missing required next-read URL: ${url}`);
  }
  invariant(config.request.timeoutMs === 10000, 'tracked timeout contract must remain 10000 ms');
  invariant(config.request.retries === 2, 'tracked retry contract must remain 2 retries');
  invariant(config.request.concurrency === 4, 'tracked concurrency contract must remain 4');
  invariant(config.request.maxRedirects === 5, 'tracked redirect contract must remain 5 hops');
  invariant(config.request.allowHttpsToHttp === false, 'tracked config must reject HTTPS downgrade by default');
  invariant(config.request.allowPrivateTargets === false, 'tracked config must reject private/loopback targets');

  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'external-link-monitor.yml'), 'utf8');
  invariant(/^\s*schedule:/m.test(workflow), 'external-link workflow is missing schedule trigger');
  invariant(/^\s*workflow_dispatch:/m.test(workflow), 'external-link workflow is missing workflow_dispatch trigger');
  invariant(!/^\s*(pull_request|push):/m.test(workflow), 'external-link workflow must not run as pull_request/push required QA');
  invariant(workflow.includes('--json external-link-report.json'), 'external-link workflow is missing JSON evidence output');
  invariant(workflow.includes('--markdown external-link-summary.md'), 'external-link workflow is missing Markdown evidence output');
  invariant(workflow.includes('if: always()'), 'external-link workflow must preserve evidence on findings/failure');
  return { sourceFileCount: inventory.sourceFiles.length, uniqueUrlCount: inventory.links.length };
}

async function selfTest() {
  const tempParent = path.join(root, '.codex-local', 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tempParent, 'external-link-monitor-'));
  const { server, counters } = createFixtureServer();
  try {
    const localhostLookupError = await new Promise((resolve) => publicLookup('localhost', {}, (error) => resolve(error)));
    invariant(localhostLookupError && localhostLookupError.code === 'PRIVATE_TARGET', 'self-test DNS lookup did not reject localhost/private resolution');
    await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', (error) => error ? reject(error) : resolve()));
    const base = `http://127.0.0.1:${server.address().port}`;
    const sourceRoot = path.join(fixtureRoot, 'src');
    fs.mkdirSync(sourceRoot, { recursive: true });
    fs.writeFileSync(path.join(sourceRoot, 'fixture.md'), [
      `[ok](${base}/ok)`,
      `[duplicate](${base}/ok)`,
      `[redirect](${base}/redirect)`,
      `[retry](${base}/retry)`,
      `[missing](${base}/not-found)`,
      `[gone](${base}/gone)`,
      `[transient](${base}/transient)`,
      `[balanced](${base}/report_(final))`,
      `[angle](<${base}/angle> "title")`,
      '[reference][paper]',
      `[paper]: ${base}/reference`,
      '`[code](https://example.invalid/ignored)`',
    ].join('\n'));
    const config = {
      sourceRoots: ['src'],
      requiredUrls: [normalizeUrl(`${base}/ok`)],
      ignore: [],
      request: { timeoutMs: 500, retries: 2, retryDelayMs: 5, concurrency: 3, maxRedirects: 3, allowHttpsToHttp: false, allowPrivateTargets: true, httpsToHttpAllowlist: [], userAgent: 'fixture-monitor/1.0' },
    };
    const inventory = buildInventory(config, fixtureRoot);
    invariant(inventory.links.length === 9, `self-test expected 9 unique URLs, got ${inventory.links.length}`);
    invariant(inventory.links.find((link) => link.url === normalizeUrl(`${base}/ok`)).occurrences.length === 2, 'self-test did not de-duplicate the duplicate URL');
    const referenceLink = inventory.links.find((link) => link.url === normalizeUrl(`${base}/reference`));
    invariant(referenceLink && referenceLink.occurrences.length === 1, 'self-test did not extract the used reference-style link exactly once');
    invariant(inventory.links.some((link) => link.url === normalizeUrl(`${base}/report_(final)`)), 'self-test did not preserve a balanced-parenthesis destination');
    invariant(inventory.links.find((link) => link.url === normalizeUrl(`${base}/angle`)).occurrences.length === 1, 'self-test angle destination was missed or counted twice');

    let missingRequiredDetected = false;
    try {
      buildInventory({ ...config, requiredUrls: [normalizeUrl(`${base}/required-missing`)] }, fixtureRoot);
    } catch (error) {
      missingRequiredDetected = error.message.includes('required external URL is missing');
    }
    invariant(missingRequiredDetected, 'self-test did not detect a missing required URL');

    const report = await monitor(config, inventory);
    invariant(report.summary.exitCode === 1, 'self-test permanent findings must return exit code 1');
    invariant(report.summary.categories.permanent === 2, 'self-test must classify 404 and 410 as permanent');
    invariant(report.summary.categories.transient === 1, 'self-test must classify persistent 503 as transient');
    invariant(report.summary.categories.redirect === 1, 'self-test must preserve redirect evidence');
    invariant(counters.get('/retry') === 2, `self-test retry recovery expected 2 attempts, got ${counters.get('/retry')}`);
    invariant(counters.get('/not-found') === 1 && counters.get('/gone') === 1, 'self-test must not retry permanent 404/410');
    invariant(counters.get('/transient') === 3, `self-test transient endpoint expected 3 attempts, got ${counters.get('/transient')}`);
    invariant(report.results.find((result) => result.url === normalizeUrl(`${base}/retry`)).category === 'success', 'self-test retry endpoint did not recover');

    const clean = await monitor(config, { sourceFiles: inventory.sourceFiles, links: inventory.links.filter((link) => link.url === normalizeUrl(`${base}/ok`)) });
    invariant(clean.summary.exitCode === 0 && clean.summary.categories.success === 1, 'self-test no-finding case must return exit code 0');

    const transientUrl = normalizeUrl(`${base}/transient`);
    const transientLink = inventory.links.find((link) => link.url === transientUrl);
    const ignoredConfig = { ...config, requiredUrls: [], ignore: [{ url: transientUrl, reason: 'fixture suppression', expires: '2999-12-31' }] };
    const ignored = await monitor(ignoredConfig, { sourceFiles: inventory.sourceFiles, links: [transientLink] });
    invariant(ignored.summary.categories.ignored === 1 && counters.get('/transient') === 3, 'self-test exact ignore must skip the request and preserve evidence');
    let expiredIgnoreDetected = false;
    try {
      validateIgnores({ ...ignoredConfig, ignore: [{ ...ignoredConfig.ignore[0], expires: '2000-01-01' }] }, { links: [transientLink] }, '2026-07-22');
    } catch (error) {
      expiredIgnoreDetected = error.message.includes('ignore entry expired');
    }
    invariant(expiredIgnoreDetected, 'self-test did not reject an expired ignore');
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    for (const directory of [tempParent, path.dirname(tempParent)]) {
      try {
        if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
      } catch (error) {
        if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
      }
    }
  }
  const tracked = validateTrackedContract();
  console.log(`OK: external-link monitor self-test (present/missing required, duplicate, redirect, retry recovery, 404, 410, transient, no-finding, exact/expired ignore; tracked ${tracked.sourceFileCount} files / ${tracked.uniqueUrlCount} URLs / scheduled+manual only)`);
}

async function run(argv) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.selfTest) {
      await selfTest();
      return 0;
    }
    const config = readConfig(options.config);
    const inventory = buildInventory(config);
    const monitored = await monitor(config, inventory);
    const report = {
      generatedAt: new Date().toISOString(),
      config: relative(options.config),
      request: config.request,
      requiredUrls: config.requiredUrls,
      sourceFileCount: inventory.sourceFiles.length,
      uniqueUrlCount: inventory.links.length,
      duplicateUrlCount: inventory.links.filter((link) => link.occurrences.length > 1).length,
      results: monitored.results,
      summary: monitored.summary,
      exitCode: monitored.summary.exitCode,
    };
    writeReports(options, report);
    console.log(markdownReport(report));
    return report.exitCode;
  } catch (error) {
    const report = { generatedAt: new Date().toISOString(), infrastructureError: error.message, exitCode: 2 };
    if (options) writeReports(options, report);
    console.error(`ERROR: ${error.message}`);
    return 2;
  }
}

if (require.main === module) {
  run(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = { normalizeUrl, extractHttpLinks, buildInventory, validateIgnores, classify, monitor, markdownReport, selfTest };
