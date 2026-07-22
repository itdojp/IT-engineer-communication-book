#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const checker = path.join(root, 'scripts', 'check-metadata-consistency.js');
const rootConfigPath = path.join(root, 'book-config.json');
const docsConfigPath = path.join(root, 'docs', 'book-config.json');

function fail(message) {
  throw new Error(message);
}

function removeDirectoryIfEmpty(directory) {
  try {
    if (fs.readdirSync(directory).length === 0) fs.rmdirSync(directory);
  } catch (error) {
    if (!['ENOENT', 'ENOTEMPTY'].includes(error.code)) throw error;
  }
}

function runChecker(configPath) {
  return spawnSync(process.execPath, [checker, '--root-config', configPath], {
    cwd: root,
    encoding: 'utf8',
  });
}

function main() {
  const rootBefore = fs.readFileSync(rootConfigPath, 'utf8');
  const docsBefore = fs.readFileSync(docsConfigPath, 'utf8');
  const tempParent = path.join(root, '.codex-local', 'tmp');
  fs.mkdirSync(tempParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tempParent, 'metadata-ux-'));
  const fixturePath = path.join(fixtureRoot, 'book-config.json');

  try {
    fs.writeFileSync(fixturePath, rootBefore);
    const positive = runChecker(fixturePath);
    if (positive.status !== 0) {
      fail(`unchanged root-config fixture must pass: ${positive.stderr || positive.stdout}`);
    }

    const fixture = JSON.parse(rootBefore);
    const moduleName = 'quickStart';
    const originalValue = fixture.ux.modules[moduleName];
    if (typeof originalValue !== 'boolean') fail(`fixture module is not boolean: ${moduleName}`);
    fixture.ux.modules[moduleName] = !originalValue;
    fs.writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`);

    const negative = runChecker(fixturePath);
    const output = `${negative.stdout}\n${negative.stderr}`;
    if (negative.status === 0 || !output.includes('docs/book-config.json.ux mismatch')) {
      fail(`single-module mutation must fail with the UX mismatch contract: ${output}`);
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
    removeDirectoryIfEmpty(tempParent);
    removeDirectoryIfEmpty(path.dirname(tempParent));
  }

  if (fs.readFileSync(rootConfigPath, 'utf8') !== rootBefore) fail('test changed tracked book-config.json');
  if (fs.readFileSync(docsConfigPath, 'utf8') !== docsBefore) fail('test changed tracked docs/book-config.json');

  console.log('OK: UX metadata fixture accepts the canonical copy, rejects one changed module flag, and leaves tracked configs unchanged');
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
