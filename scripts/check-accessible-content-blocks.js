#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const targets = [
  {
    rel: 'chapter-stakeholder-communication/index.md',
    id: 'accessible-consensus-decision',
    endMarker: '### 技術選定プロセスの標準化',
    builtRel: 'chapter-stakeholder-communication/index.html',
    builtEndMarker: '技術選定プロセスの標準化',
    required: [
      '合意形成の3ステップ',
      'ステップ1: Individual Assessment',
      'ステップ2: Perspective Sharing',
      'ステップ3: Convergence Process',
      '状態: 高い合意',
      '状態: 要調整',
      '状態: 低い合意',
      'accessible-status-card--high',
      'accessible-status-card--moderate',
      'accessible-status-card--low',
    ],
  },
  {
    rel: 'chapter-digital-communication/index.md',
    id: 'accessible-async-context',
    endMarker: '### 🎯 バーチャル会議の効率化',
    builtRel: 'chapter-digital-communication/index.html',
    builtEndMarker: 'バーチャル会議の効率化',
    required: [
      'Context Package',
      'Thread Management',
      'Auto Summary',
      '非同期議論の管理フロー',
      'ステップ1: Discussion Start',
      'ステップ2: Message Flow',
      'ステップ3: Auto Summary',
      'accessible-definition-list',
      'accessible-step-list',
    ],
  },
];

function fail(message) {
  throw new Error(message);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractSection(text, target, built = false) {
  const startToken = `id="${target.id}"`;
  const tokenIndex = text.indexOf(startToken);
  if (tokenIndex < 0) fail(`${target.id}: target id is missing`);
  if (text.indexOf(startToken, tokenIndex + startToken.length) >= 0) {
    fail(`${target.id}: target id must be unique`);
  }
  const start = text.lastIndexOf('<section', tokenIndex);
  if (start < 0) fail(`${target.id}: semantic section start is missing`);
  const marker = built ? target.builtEndMarker : target.endMarker;
  const end = text.indexOf(marker, tokenIndex + startToken.length);
  if (end < 0) fail(`${target.id}: following boundary is missing`);
  return text.slice(start, end);
}

function walkFiles(dir, suffix) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkFiles(absolute, suffix));
    else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(absolute);
  }
  return found;
}

function channel(value) {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) fail(`invalid six-digit color: ${hex}`);
  const value = match[1];
  return 0.2126 * channel(parseInt(value.slice(0, 2), 16))
    + 0.7152 * channel(parseInt(value.slice(2, 4), 16))
    + 0.0722 * channel(parseInt(value.slice(4, 6), 16));
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function selectorBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'm').exec(css);
  if (!match) fail(`CSS selector block is missing: ${selector}`);
  return match[1];
}

function assertDeclaration(css, selector, declaration) {
  const block = selectorBlock(css, selector);
  if (!block.includes(declaration)) fail(`${selector} is missing declaration: ${declaration}`);
}

function assertCssContract(css) {
  const required = [
    '/* Accessible explanatory blocks (Issue #152)',
    '.accessible-panel',
    '.accessible-card-grid',
    'grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));',
    '.accessible-status-card--high',
    '.accessible-status-card--moderate',
    '.accessible-status-card--low',
    '.accessible-step-badge',
    '.accessible-definition-list--two-columns',
    'overflow-wrap: anywhere;',
    '@media (max-width: 640px)',
    'grid-template-columns: minmax(0, 1fr);',
  ];
  for (const token of required) {
    if (!css.includes(token)) fail(`CSS contract is missing: ${token}`);
  }

  const fixedDeclarations = [
    ['.accessible-step-badge', 'color: #ffffff;'],
    ['.accessible-step-badge', 'background: #1e40af;'],
    ['.accessible-step-badge', 'font-size: 1rem;'],
    ['.accessible-status-card--high', 'background: #f0fdf4;'],
    ['.accessible-status-card--moderate', 'background: #fffbeb;'],
    ['.accessible-status-card--low', 'background: #fef2f2;'],
    ['[data-theme="dark"] .accessible-status-card--high', 'background: #16392b;'],
    ['[data-theme="dark"] .accessible-status-card--moderate', 'background: #422f12;'],
    ['[data-theme="dark"] .accessible-status-card--low', 'background: #461c25;'],
  ];
  for (const [selector, declaration] of fixedDeclarations) {
    assertDeclaration(css, selector, declaration);
  }

  const component = css.slice(css.indexOf('/* Accessible explanatory blocks (Issue #152)'));
  const small = [...component.matchAll(/font-size\s*:\s*([0-9.]+)(rem|em|px)/gi)].filter((match) => {
    const value = Number(match[1]);
    if (match[2].toLowerCase() === 'px') return value < 16;
    return value < 1;
  });
  if (small.length > 0) fail(`accessible CSS contains small text: ${small[0][0]}`);

  const requiredColors = [
    '#1e293b', '#f1f5f9', '#ffffff', '#1e40af',
    '#f8fafc', '#f1f5f9', '#f0fdf4', '#fffbeb', '#fef2f2',
    '#0f172a', '#1e293b', '#334155', '#16392b', '#422f12', '#461c25',
  ];
  for (const color of new Set(requiredColors)) {
    if (!css.toLowerCase().includes(color)) fail(`CSS contract color is missing: ${color}`);
  }

  const pairs = [
    ['#ffffff', '#1e40af', 'step badge'],
    ['#1e293b', '#f8fafc', 'light panel'],
    ['#1e293b', '#f1f5f9', 'light header'],
    ['#1e293b', '#ffffff', 'light card'],
    ['#1e293b', '#f0fdf4', 'high status'],
    ['#1e293b', '#fffbeb', 'moderate status'],
    ['#1e293b', '#fef2f2', 'low status'],
    ['#f1f5f9', '#0f172a', 'dark card'],
    ['#f1f5f9', '#1e293b', 'dark panel'],
    ['#f1f5f9', '#334155', 'dark header'],
    ['#f1f5f9', '#16392b', 'dark high status'],
    ['#f1f5f9', '#422f12', 'dark moderate status'],
    ['#f1f5f9', '#461c25', 'dark low status'],
  ];
  for (const [fg, bg, label] of pairs) {
    const ratio = contrastRatio(fg, bg);
    if (ratio < 4.5) fail(`${label}: contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
  }
}

function assertTargetSection(text, target, built = false) {
  const section = extractSection(text, target, built);
  if (/\sstyle\s*=/i.test(section)) fail(`${target.id}: inline style remains in target section`);
  const unsupportedClass = /\b(?:accessible-panel--decision|accessible-card-grid--three)\b/.exec(section);
  if (unsupportedClass) fail(`${target.id}: unsupported no-op class remains: ${unsupportedClass[0]}`);
  if (/font-size\s*:\s*(?:0\.[0-9]+em|(?:[0-9]|1[0-5])px)/i.test(section)) {
    fail(`${target.id}: small text remains in target section`);
  }
  for (const token of target.required) {
    if (!section.includes(token)) fail(`${target.id}: required semantic/visible marker is missing: ${token}`);
  }
  for (const tag of ['<section', '<h4', '<h5']) {
    if (!section.includes(tag)) fail(`${target.id}: semantic tag is missing: ${tag}>`);
  }
  if (!section.includes('<ol') || (!section.includes('<ul') && target.id.includes('consensus'))) {
    fail(`${target.id}: semantic sequence/list contract is missing`);
  }
  return section;
}

function assertNoExtremeSmallText(roots) {
  const pattern = /font-size\s*:\s*0\.65em/i;
  for (const base of roots) {
    for (const file of walkFiles(base, '.md')) {
      if (pattern.test(read(file))) fail(`active 0.65em text remains: ${path.relative(root, file)}`);
    }
  }
}

function sourceSnapshot() {
  const source = new Map();
  const generated = new Map();
  for (const target of targets) {
    source.set(target.rel, read(path.join(root, 'src', target.rel)));
    generated.set(target.rel, read(path.join(root, 'docs', target.rel)));
  }
  return {
    source,
    generated,
    css: read(path.join(root, 'docs/assets/css/main.css')),
  };
}

function assertSourceSnapshot(snapshot) {
  assertCssContract(snapshot.css);
  for (const target of targets) {
    const canonical = snapshot.source.get(target.rel);
    const published = snapshot.generated.get(target.rel);
    if (canonical !== published) fail(`${target.rel}: canonical/generated bytes differ`);
    assertTargetSection(canonical, target, false);
  }
  assertNoExtremeSmallText([path.join(root, 'src'), path.join(root, 'docs')]);
}

function assertBuiltSite(siteDir) {
  const cssPath = path.join(siteDir, 'assets/css/main.css');
  if (!fs.existsSync(cssPath)) fail(`built CSS is missing: ${cssPath}`);
  assertCssContract(read(cssPath));
  for (const target of targets) {
    const page = path.join(siteDir, target.builtRel);
    if (!fs.existsSync(page)) fail(`built target page is missing: ${page}`);
    const html = read(page);
    if (/font-size\s*:\s*0\.65em/i.test(html)) fail(`${target.builtRel}: active 0.65em text remains`);
    assertTargetSection(html, target, true);
  }
}

function expectFailure(label, action, expected) {
  let error;
  try { action(); } catch (caught) { error = caught; }
  if (!error || !error.message.includes(expected)) {
    fail(`self-test did not reject ${label}; got ${error ? error.message : 'no error'}`);
  }
}

function cloneSnapshot(snapshot) {
  return {
    source: new Map(snapshot.source),
    generated: new Map(snapshot.generated),
    css: snapshot.css,
  };
}

function selfTest() {
  const baseline = sourceSnapshot();
  assertSourceSnapshot(baseline);

  let mutation = cloneSnapshot(baseline);
  for (const collection of [mutation.source, mutation.generated]) {
    const value = collection.get(targets[0].rel);
    collection.set(targets[0].rel, value.replace('状態: 要調整', 'Moderate'));
  }
  expectFailure('missing visible status label', () => assertSourceSnapshot(mutation), '状態: 要調整');

  mutation = cloneSnapshot(baseline);
  for (const collection of [mutation.source, mutation.generated]) {
    const value = collection.get(targets[1].rel);
    collection.set(targets[1].rel, value.replace('class="accessible-card"', 'class="accessible-card" style="font-size: 0.65em"'));
  }
  expectFailure('inline small style', () => assertSourceSnapshot(mutation), 'inline style');

  mutation = cloneSnapshot(baseline);
  mutation.css = mutation.css.replace(
    '    border-radius: 999px;\n    font-size: 1rem;',
    '    border-radius: 999px;\n    font-size: 0.75rem;',
  );
  expectFailure('small component CSS', () => assertSourceSnapshot(mutation), 'font-size: 1rem;');

  mutation = cloneSnapshot(baseline);
  mutation.css = mutation.css.replace('@media (max-width: 640px)', '@media (max-width: 1px)');
  expectFailure('missing responsive breakpoint', () => assertSourceSnapshot(mutation), '@media (max-width: 640px)');

  mutation = cloneSnapshot(baseline);
  mutation.css = mutation.css.replace(
    '    background: #1e40af;\n    border-radius: 999px;',
    '    background: #f59e0b;\n    border-radius: 999px;',
  );
  expectFailure('unapproved low-contrast badge color', () => assertSourceSnapshot(mutation), 'background: #1e40af;');

  console.log('OK: accessibility contract self-test passed (5 negative mutations)');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  const builtIndex = args.indexOf('--built-site');
  if (builtIndex >= 0) {
    const value = args[builtIndex + 1];
    if (!value || value.startsWith('--')) fail('--built-site requires a directory');
    assertBuiltSite(path.resolve(root, value));
    console.log(`OK: built accessibility contract passed (${targets.length} target pages)`);
    return;
  }
  if (args.length > 0) fail(`unknown arguments: ${args.join(' ')}`);
  const snapshot = sourceSnapshot();
  assertSourceSnapshot(snapshot);
  console.log(`OK: source accessibility contract passed (${targets.length} canonical/generated targets)`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
