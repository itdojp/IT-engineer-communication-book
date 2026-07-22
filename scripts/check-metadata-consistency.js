#!/usr/bin/env node
'use strict';

/**
 * Validate public metadata and navigation coverage without third-party deps.
 * This repository publishes `docs/`; the check keeps package metadata,
 * book config, Jekyll config, top-page front matter, navigation, and assets
 * aligned before CI publishes GitHub Pages.
 */

const fs = require('fs');
const path = require('path');
const { isDeepStrictEqual } = require('util');

const root = path.resolve(__dirname, '..');
const docs = path.join(root, 'docs');

const expected = {
  packageName: 'it-engineer-communication-book',
  title: 'エンジニアのための実践コミュニケーション設計',
  description: 'システム思考とデータ駆動で身につける対人スキルとメンタル管理',
  author: 'ITDO Inc.（株式会社アイティードゥ）',
  version: '1.0.0',
  license: 'CC-BY-NC-SA-4.0',
  lang: 'ja',
  url: 'https://itdojp.github.io',
  baseurl: '/IT-engineer-communication-book',
  homepage: 'https://itdojp.github.io/IT-engineer-communication-book/',
  repositoryFull: 'itdojp/IT-engineer-communication-book',
  repositoryUrl: 'https://github.com/itdojp/IT-engineer-communication-book',
  repositoryGit: 'git+https://github.com/itdojp/IT-engineer-communication-book.git',
};

const requiredNavSections = ['introduction', 'chapters', 'appendices'];
const supportedNavSections = ['introduction', 'chapters', 'additional', 'resources', 'appendices', 'afterword'];
const requiredAssets = [
  'assets/css/main.css',
  'assets/css/syntax-highlighting.css',
  'assets/js/theme.js',
  'assets/js/search.js',
  'assets/js/code-copy-lightweight.js',
  'assets/images/itdo_logo_48x48_blue.png',
];

const appendixRoutesById = {
  checklists: '/appendix-01-checklists/',
  templates: '/appendix-02-templates/',
  tools: '/appendix-03-tools-resources/',
  references: '/appendix-04-references/',
  'troubleshooting-flow': '/appendix-05-troubleshooting-flow/',
  'figure-index': '/appendix-06-figure-index/',
};

const requiredUxModulePages = {
  troubleshootingFlow: {
    route: '/appendix-05-troubleshooting-flow/',
    source: 'src/appendix-05-troubleshooting-flow/index.md',
    public: 'docs/appendix-05-troubleshooting-flow/index.md',
  },
  figureIndex: {
    route: '/appendix-06-figure-index/',
    source: 'src/appendix-06-figure-index/index.md',
    public: 'docs/appendix-06-figure-index/index.md',
  },
};

const expectedInlineSvgCount = 20;
const expectedFigures = [
  ['F01', 'PREP法による技術説明の最適化', 'chapter-quickstart', 'figure-01'],
  ['F02', '制約説明の3ステップ変換', 'chapter-quickstart', 'figure-02'],
  ['F03', 'エンジニア向けストレス早期発見システム', 'chapter-quickstart', 'figure-03'],
  ['F04', 'システム思考の認知プロセス', 'chapter-engineering-communication', 'figure-04'],
  ['F05', '詳細志向の二面性', 'chapter-engineering-communication', 'figure-05'],
  ['F06', '認知負荷とコミュニケーション効率', 'chapter-engineering-communication', 'figure-06'],
  ['F07', '技術者間コミュニケーションの情報圧縮', 'chapter-communication-challenges', 'figure-07'],
  ['F08', 'チーム内技術専門性マトリックス', 'chapter-communication-challenges', 'figure-08'],
  ['F09', 'プログラミング思考をコミュニケーションに応用', 'chapter-structured-communication', 'figure-09'],
  ['F10', 'RFC形式の基本構造', 'chapter-structured-communication', 'figure-10'],
  ['F11', '技術討議フレームワーク', 'chapter-stakeholder-communication', 'figure-11'],
  ['F12', '技術選定の定量的評価フレームワーク', 'chapter-stakeholder-communication', 'figure-12'],
  ['F13', '非同期コミュニケーション時間軸設計', 'chapter-digital-communication', 'figure-13'],
  ['F14', '技術的負債とストレスの構造的関係', 'chapter-stress-analysis', 'figure-14'],
  ['F15', '技術的負債ストレス影響分析システム', 'chapter-stress-analysis', 'figure-15'],
  ['F16', 'レガシーコードストレスパターン分析', 'chapter-stress-analysis', 'figure-16'],
  ['F17', '技術陳腐化不安の構造的分析', 'chapter-stress-analysis', 'figure-17'],
  ['F18', '技術学習最適化システム', 'chapter-stress-analysis', 'figure-18'],
  ['F19', 'Personal Mental Health System Architecture', 'chapter-technical-mental-health', 'figure-19'],
  ['F20', '多層防御型メンタルヘルス・アーキテクチャ', 'chapter-preventive-systems', 'figure-20'],
];
const expectedTroubleshootingTargets = [
  ['appendix-01-checklists', 'a1'],
  ['appendix-01-checklists', 'a3'],
  ['appendix-01-checklists', 'a5'],
  ['appendix-01-checklists', 'a9'],
  ['appendix-02-templates', 't1-context-package'],
  ['appendix-02-templates', 't2'],
  ['appendix-02-templates', 't3'],
  ['appendix-02-templates', 't4'],
  ['appendix-02-templates', 't8'],
  ['appendix-02-templates', 't9'],
  ['appendix-02-templates', 't10'],
];

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function rel(filePath) {
  return path.relative(root, filePath) || '.';
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    fail(`failed to read JSON ${rel(filePath)}: ${error.message}`);
  }
}

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2 && trimmed[0] === trimmed[trimmed.length - 1] && ['"', "'"].includes(trimmed[0])) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function readSimpleYamlScalars(filePath) {
  if (!fs.existsSync(filePath)) fail(`required file is missing: ${rel(filePath)}`);
  const result = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!rawLine || /^[ \t#]/.test(rawLine) || !rawLine.includes(':')) continue;
    const [key, ...valueParts] = rawLine.split(':');
    const value = valueParts.join(':').trim();
    if (!key.trim() || !value || ['|', '>'].includes(value)) continue;
    result[key.trim()] = stripQuotes(value.replace(/\s+#.*$/, ''));
  }
  return result;
}

function parseFrontMatter(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  if (lines[0] !== '---') fail(`${rel(filePath)} is missing YAML front matter`);
  const end = lines.indexOf('---', 1);
  if (end < 0) fail(`${rel(filePath)} has no closing front matter delimiter`);
  const result = {};
  for (const rawLine of lines.slice(1, end)) {
    if (!rawLine || /^[ \t#]/.test(rawLine) || !rawLine.includes(':')) continue;
    const [key, ...valueParts] = rawLine.split(':');
    result[key.trim()] = stripQuotes(valueParts.join(':').trim());
  }
  return result;
}

function normalizePath(value) {
  if (typeof value !== 'string') return null;
  let route = value.trim();
  if (!route || /^(https?:|mailto:)/.test(route)) return null;
  if (!route.startsWith('/')) route = `/${route}`;
  const lower = route.toLowerCase();
  if (/\.(md|html?|pdf|txt)$/.test(lower)) return route;
  return route.endsWith('/') ? route : `${route}/`;
}

function assertSafePath(route, label) {
  if (!route.startsWith('/')) fail(`${label} must start with '/': ${route}`);
  if (route.includes('\\')) fail(`${label} contains a backslash: ${route}`);
  if (route.includes('//')) fail(`${label} contains duplicate slashes: ${route}`);
  if (route.split('/').filter(Boolean).some((part) => part === '.' || part === '..')) {
    fail(`${label} contains an unsafe segment: ${route}`);
  }
}

function readNavigation(filePath) {
  if (!fs.existsSync(filePath)) fail(`required file is missing: ${rel(filePath)}`);
  const sections = Object.fromEntries(supportedNavSections.map((section) => [section, []]));
  let currentSection = null;
  let currentItem = null;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    const stripped = line.trim();
    if (!stripped || stripped.startsWith('#')) continue;
    if (!/^[ \t]/.test(line) && stripped.endsWith(':')) {
      currentSection = stripped.slice(0, -1);
      currentItem = null;
      continue;
    }
    if (!supportedNavSections.includes(currentSection)) continue;
    let content = stripped;
    if (content.startsWith('- ')) {
      currentItem = {};
      sections[currentSection].push(currentItem);
      content = content.slice(2).trim();
      if (!content) continue;
    }
    if (!currentItem || !content.includes(':')) continue;
    const [key, ...valueParts] = content.split(':');
    currentItem[key.trim()] = stripQuotes(valueParts.join(':').trim());
  }
  return sections;
}

function markdownRoute(filePath) {
  const frontMatter = parseFrontMatter(filePath);
  const permalink = normalizePath(frontMatter.permalink);
  if (permalink) return permalink;
  const relPath = path.relative(docs, filePath).split(path.sep).join('/');
  if (relPath === 'index.md') return '/';
  if (relPath.endsWith('/index.md')) return `/${relPath.slice(0, -'index.md'.length)}`;
  return `/${relPath.replace(/\.md$/, '')}/`;
}

function listMarkdownFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('_') || entry.name === 'assets') continue;
      out.push(...listMarkdownFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function assertEqual(actual, expectedValue, label) {
  if (actual !== expectedValue) {
    fail(`${label} mismatch: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    fail(`${label} does not contain ${JSON.stringify(needle)}`);
  }
}

function checkBookConfig(config, label) {
  for (const key of ['title', 'description', 'author', 'version', 'license', 'homepage', 'repository']) {
    const expectedKey = key === 'repository' ? 'repositoryUrl' : key;
    assertEqual(config[key], expected[expectedKey], `${label}.${key}`);
  }
  const chapters = (config.structure && config.structure.chapters) || [];
  const appendices = (config.structure && config.structure.appendices) || [];
  if (!chapters.length) fail(`${label}.structure.chapters must not be empty`);
  if (!appendices.length) fail(`${label}.structure.appendices must not be empty`);
  return { chapters, appendices };
}

function checkMetadata(rootConfig, docsConfigJson, packageJson, packageLock) {
  const rootStructure = checkBookConfig(rootConfig, 'book-config.json');
  const docsStructure = checkBookConfig(docsConfigJson, 'docs/book-config.json');
  if (!isDeepStrictEqual(docsStructure, rootStructure)) {
    fail('docs/book-config.json.structure mismatch: expected the same ordered chapter/appendix structure as book-config.json');
  }
  if (!isDeepStrictEqual(docsConfigJson.ux, rootConfig.ux)) {
    fail('docs/book-config.json.ux mismatch: expected the same UX profile and module flags as book-config.json');
  }

  assertEqual(packageJson.name, expected.packageName, 'package.json.name');
  for (const key of ['description', 'version', 'author', 'license']) {
    assertEqual(packageJson[key], expected[key], `package.json.${key}`);
  }
  assertEqual(packageJson.repository && packageJson.repository.type, 'git', 'package.json.repository.type');
  assertEqual(packageJson.repository && packageJson.repository.url, expected.repositoryGit, 'package.json.repository.url');
  assertEqual(packageJson.homepage, expected.homepage, 'package.json.homepage');
  assertEqual(packageJson.bugs && packageJson.bugs.url, `${expected.repositoryUrl}/issues`, 'package.json.bugs.url');
  assertEqual(packageJson.scripts && packageJson.scripts['check:metadata'], 'node scripts/check-metadata-consistency.js', 'package.json.scripts.check:metadata');
  if (!String(packageJson.scripts && packageJson.scripts.test || '').includes('npm run check:metadata')) {
    fail('package.json.scripts.test must run npm run check:metadata');
  }

  assertEqual(packageLock.name, expected.packageName, 'package-lock.json.name');
  assertEqual(packageLock.version, expected.version, 'package-lock.json.version');
  assertEqual(packageLock.packages && packageLock.packages[''] && packageLock.packages[''].name, expected.packageName, 'package-lock.json.packages[""].name');
  assertEqual(packageLock.packages && packageLock.packages[''] && packageLock.packages[''].version, expected.version, 'package-lock.json.packages[""].version');

  const jekyll = readSimpleYamlScalars(path.join(docs, '_config.yml'));
  for (const key of ['title', 'description', 'author', 'version', 'license', 'lang', 'url', 'baseurl', 'homepage']) {
    assertEqual(jekyll[key], expected[key], `docs/_config.yml.${key}`);
  }
  assertEqual(jekyll.repository, expected.repositoryFull, 'docs/_config.yml.repository');
  assertEqual(jekyll.repository_url, expected.repositoryUrl, 'docs/_config.yml.repository_url');

  const indexFrontMatter = parseFrontMatter(path.join(docs, 'index.md'));
  for (const key of ['title', 'description', 'author', 'version']) {
    assertEqual(indexFrontMatter[key], expected[key], `docs/index.md front matter ${key}`);
  }
}

function checkNavigation(bookConfig, navSectionsData) {
  const publishedRoutes = new Map();
  for (const filePath of listMarkdownFiles(docs)) {
    const route = markdownRoute(filePath);
    assertSafePath(route, `published route for ${rel(filePath)}`);
    if (publishedRoutes.has(route)) {
      fail(`duplicate published route ${route}: ${rel(publishedRoutes.get(route))} and ${rel(filePath)}`);
    }
    publishedRoutes.set(route, filePath);
  }

  const navRoutes = [];
  const seen = new Map();
  for (const section of requiredNavSections) {
    if (!(navSectionsData[section] || []).length) fail(`navigation.${section} has no items`);
  }

  for (const section of supportedNavSections) {
    const items = navSectionsData[section] || [];
    for (const [index, item] of items.entries()) {
      const route = normalizePath(item.path);
      if (!item.title || !route) fail(`navigation.${section}[${index + 1}] is missing title or path`);
      assertSafePath(route, `navigation.${section}[${index + 1}].path`);
      if (seen.has(route)) fail(`duplicate navigation path ${route}: ${seen.get(route)} and ${item.title}`);
      seen.set(route, item.title);
      if (!publishedRoutes.has(route)) fail(`navigation path has no docs page: ${route}`);
      navRoutes.push(route);
    }
  }

  const expectedRoutes = [...publishedRoutes.keys()].filter((route) => route !== '/').sort();
  const actualRoutes = [...navRoutes].sort();
  const missing = expectedRoutes.filter((route) => !actualRoutes.includes(route));
  const extra = actualRoutes.filter((route) => !expectedRoutes.includes(route));
  if (missing.length || extra.length) {
    fail(`navigation/docs route mismatch: missing=${JSON.stringify(missing)}, extra=${JSON.stringify(extra)}`);
  }

  const structureRoutes = [];
  for (const chapter of bookConfig.structure.chapters) {
    if (!chapter.id || !chapter.title) fail('book-config.json.structure.chapters contains an item without id/title');
    structureRoutes.push(`/chapter-${chapter.id}/`);
  }
  for (const appendix of bookConfig.structure.appendices) {
    if (!appendix.id || !appendix.title) fail('book-config.json.structure.appendices contains an item without id/title');
    const route = appendixRoutesById[appendix.id];
    if (!route) fail(`book-config.json.structure.appendices has no route mapping for id ${appendix.id}`);
    structureRoutes.push(route);
  }
  for (const route of structureRoutes) {
    if (!publishedRoutes.has(route)) fail(`book-config structure route has no docs page: ${route}`);
    if (!seen.has(route)) fail(`book-config structure route is missing from navigation: ${route}`);
  }
  const structureRouteSet = [...new Set(structureRoutes)].sort();
  const structureMissing = expectedRoutes.filter((route) => !structureRouteSet.includes(route));
  const structureExtra = structureRouteSet.filter((route) => !expectedRoutes.includes(route));
  if (structureMissing.length || structureExtra.length) {
    fail(`book-config/docs route mismatch: missing=${JSON.stringify(structureMissing)}, extra=${JSON.stringify(structureExtra)}`);
  }

  return { pageCount: publishedRoutes.size, navCount: navRoutes.length };
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[0]);
}

function checkUxModulePages(rootConfig, docsConfigJson, navigation) {
  for (const moduleName of Object.keys(requiredUxModulePages)) {
    assertEqual(rootConfig.ux && rootConfig.ux.modules && rootConfig.ux.modules[moduleName], true, `book-config.json.ux.modules.${moduleName}`);
    assertEqual(docsConfigJson.ux && docsConfigJson.ux.modules && docsConfigJson.ux.modules[moduleName], true, `docs/book-config.json.ux.modules.${moduleName}`);

    const modulePage = requiredUxModulePages[moduleName];
    for (const relativePath of [modulePage.source, modulePage.public]) {
      const filePath = path.join(root, relativePath);
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        fail(`${moduleName} page is missing: ${relativePath}`);
      }
      const frontMatter = parseFrontMatter(filePath);
      assertEqual(frontMatter.ux_module, moduleName, `${relativePath} front matter ux_module`);
      assertEqual(normalizePath(frontMatter.module_route), modulePage.route, `${relativePath} front matter module_route`);
    }

    const publicPagePath = path.join(root, modulePage.public);
    assertEqual(markdownRoute(publicPagePath), modulePage.route, `${modulePage.public} published route`);
    const navItems = Object.values(navigation).flat();
    if (!navItems.some((item) => normalizePath(item.path) === modulePage.route)) {
      fail(`${moduleName} route is missing from navigation: ${modulePage.route}`);
    }
  }

  const countInlineSvgs = (dir) => listMarkdownFiles(dir)
    .map((filePath) => countMatches(fs.readFileSync(filePath, 'utf8'), /<svg\b/g).length)
    .reduce((total, count) => total + count, 0);
  const sourceSvgCount = countInlineSvgs(path.join(root, 'src'));
  const publicSvgCount = countInlineSvgs(docs);
  assertEqual(sourceSvgCount, expectedInlineSvgCount, 'src inline SVG inventory count');
  assertEqual(publicSvgCount, expectedInlineSvgCount, 'docs inline SVG inventory count');

  const publicTroubleshooting = fs.readFileSync(path.join(root, requiredUxModulePages.troubleshootingFlow.public), 'utf8');
  const sourceTroubleshooting = fs.readFileSync(path.join(root, requiredUxModulePages.troubleshootingFlow.source), 'utf8');
  assertEqual(sourceTroubleshooting, publicTroubleshooting, 'src/docs troubleshooting flow content');
  expectedTroubleshootingTargets.forEach(([target, anchor]) => {
    assertContains(publicTroubleshooting, `../${target}/#${anchor}`, `troubleshooting target ${target}#${anchor}`);
    for (const contentRoot of ['docs', 'src']) {
      const targetPage = fs.readFileSync(path.join(root, contentRoot, target, 'index.md'), 'utf8');
      assertContains(targetPage, `<span id="${anchor}" aria-hidden="true"></span>`, `${contentRoot} stable anchor ${target}#${anchor}`);
    }
  });

  const figureIndexPath = path.join(root, requiredUxModulePages.figureIndex.public);
  const figureIndex = fs.readFileSync(figureIndexPath, 'utf8');
  const sourceFigureIndex = fs.readFileSync(path.join(root, requiredUxModulePages.figureIndex.source), 'utf8');
  assertEqual(sourceFigureIndex, figureIndex, 'src/docs figure index content');
  const figureRows = figureIndex.split(/\r?\n/).filter((line) => /^\| F\d{2} \|/.test(line));
  assertEqual(figureRows.length, expectedFigures.length, 'figure index entry count');

  const publicAnchors = [];
  const sourceAnchors = [];
  expectedFigures.forEach(([id, title, chapter, anchor], index) => {
    const publicPage = fs.readFileSync(path.join(docs, chapter, 'index.md'), 'utf8');
    const sourcePage = fs.readFileSync(path.join(root, 'src', chapter, 'index.md'), 'utf8');
    const anchorMarkup = `<span id="${anchor}" aria-hidden="true"></span>`;
    assertContains(publicPage, `${anchorMarkup}\n<svg`, `public ${id} anchor placement`);
    assertContains(sourcePage, `${anchorMarkup}\n<svg`, `source ${id} anchor placement`);
    assertContains(publicPage, `<title>${title}</title>`, `public ${id} SVG title`);
    assertContains(sourcePage, `<title>${title}</title>`, `source ${id} SVG title`);
    publicAnchors.push(...countMatches(publicPage, new RegExp(`id="${anchor}"`, 'g')));
    sourceAnchors.push(...countMatches(sourcePage, new RegExp(`id="${anchor}"`, 'g')));

    const row = figureRows[index] || '';
    assertContains(row, `| ${id} | ${title} |`, `figure index ${id} title/order`);
    assertContains(row, `](../${chapter}/#${anchor})`, `figure index ${id} route`);
  });
  assertEqual(publicAnchors.length, expectedFigures.length, 'public exact inline SVG anchors');
  assertEqual(sourceAnchors.length, expectedFigures.length, 'source exact inline SVG anchors');

  return { moduleCount: Object.keys(requiredUxModulePages).length, inlineSvgCount: publicSvgCount };
}

function checkAssets() {
  const missing = requiredAssets.filter((asset) => {
    const filePath = path.join(docs, asset);
    return !fs.existsSync(filePath) || !fs.statSync(filePath).isFile() || fs.statSync(filePath).size === 0;
  });
  if (missing.length) fail(`required public assets are missing or empty: ${missing.join(', ')}`);
}

function parseArgs(argv) {
  const options = {
    rootConfig: path.join(root, 'book-config.json'),
    builtSite: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!['--root-config', '--built-site'].includes(argument)) {
      fail(`unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`${argument} requires a path`);
    const resolved = path.resolve(root, value);
    if (argument === '--root-config') options.rootConfig = resolved;
    if (argument === '--built-site') options.builtSite = resolved;
    index += 1;
  }
  return options;
}

function checkBuiltUxMetadata(bookConfig, builtSite, rootConfigPath) {
  if (!fs.existsSync(builtSite) || !fs.statSync(builtSite).isDirectory()) {
    fail(`built site directory is missing: ${rel(builtSite)}`);
  }
  const builtConfigPath = path.join(builtSite, 'book-config.json');
  const builtConfig = readJson(builtConfigPath);
  if (!isDeepStrictEqual(builtConfig.ux, bookConfig.ux)) {
    fail(`${rel(builtConfigPath)}.ux mismatch: expected the canonical UX profile and complete module flags from ${rel(rootConfigPath)}`);
  }
  return Object.keys((bookConfig.ux && bookConfig.ux.modules) || {}).length;
}

const options = parseArgs(process.argv.slice(2));
const bookConfig = readJson(options.rootConfig);
const docsBookConfig = readJson(path.join(docs, 'book-config.json'));
const packageJson = readJson(path.join(root, 'package.json'));
const packageLock = readJson(path.join(root, 'package-lock.json'));
const navigation = readNavigation(path.join(docs, '_data', 'navigation.yml'));

checkMetadata(bookConfig, docsBookConfig, packageJson, packageLock);
const counts = checkNavigation(bookConfig, navigation);
const uxCounts = checkUxModulePages(bookConfig, docsBookConfig, navigation);
checkAssets();
const builtModuleCount = options.builtSite ? checkBuiltUxMetadata(bookConfig, options.builtSite, options.rootConfig) : null;
const builtSummary = builtModuleCount === null ? '' : `, built UX profile + ${builtModuleCount} module flags`;
console.log(`OK: metadata/navigation/UX coverage is consistent (${counts.navCount} navigation entries, ${counts.pageCount} docs pages, ${uxCounts.moduleCount} UX modules, ${uxCounts.inlineSvgCount} inline SVGs${builtSummary})`);
