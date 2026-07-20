#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repositoryRoot, 'src/canonical-content.json');

function fail(message) {
  throw new Error(message);
}

function validateRelativeContentPath(relPath, label) {
  if (typeof relPath !== 'string' || relPath.length === 0) fail(`${label} must be a non-empty string`);
  if (relPath.includes('\\') || path.posix.isAbsolute(relPath)) fail(`${label} must be a POSIX relative path: ${relPath}`);
  const normalized = path.posix.normalize(relPath);
  if (normalized !== relPath || normalized === '..' || normalized.startsWith('../')) {
    fail(`${label} must not escape or normalize outside its root: ${relPath}`);
  }
  if (!relPath.endsWith('/index.md')) fail(`${label} must map a chapter/appendix index.md: ${relPath}`);
}

function assertUniqueSorted(values, label) {
  if (!Array.isArray(values) || values.length === 0) fail(`${label} must be a non-empty array`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicate entries`);
  const sorted = [...values].sort();
  if (sorted.some((value, index) => value !== values[index])) fail(`${label} must be sorted`);
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('manifest must be an object');
  if (manifest.version !== 2) fail('manifest version must be 2');
  if (manifest.canonical_root !== 'src' || manifest.generated_root !== 'docs') {
    fail('canonical_root/generated_root must remain src/docs');
  }

  assertUniqueSorted(manifest.files, 'manifest.files');
  for (const relPath of manifest.files) validateRelativeContentPath(relPath, 'manifest file');

  if (!Array.isArray(manifest.migration_batches) || manifest.migration_batches.length === 0) {
    fail('migration_batches must be a non-empty array');
  }
  const batchIds = [];
  const mappedFiles = [];
  for (const batch of manifest.migration_batches) {
    if (!batch || typeof batch !== 'object' || Array.isArray(batch)) fail('each migration batch must be an object');
    if (typeof batch.id !== 'string' || !/^[a-z0-9-]+$/.test(batch.id)) fail('migration batch id is invalid');
    batchIds.push(batch.id);
    if (!Number.isInteger(batch.source_issue) || batch.source_issue <= 0) fail(`${batch.id}: source_issue must be a positive integer`);
    if (typeof batch.baseline_commit !== 'string' || !/^[0-9a-f]{40}$/.test(batch.baseline_commit)) {
      fail(`${batch.id}: baseline_commit must be a full commit SHA`);
    }
    assertUniqueSorted(batch.files, `${batch.id}.files`);
    for (const relPath of batch.files) validateRelativeContentPath(relPath, `${batch.id} file`);
    mappedFiles.push(...batch.files);
  }
  if (new Set(batchIds).size !== batchIds.length) fail('migration batch ids must be unique');
  if (new Set(mappedFiles).size !== mappedFiles.length) fail('a content file must belong to exactly one migration batch');
  const mappedSet = new Set(mappedFiles);
  if (mappedSet.size !== manifest.files.length || manifest.files.some((file) => !mappedSet.has(file))) {
    fail('manifest.files must exactly match the union of migration batch files');
  }

  if (!Array.isArray(manifest.site_implementation_exclusions) || manifest.site_implementation_exclusions.length === 0) {
    fail('site_implementation_exclusions must document non-generated site responsibilities');
  }
  for (const excluded of manifest.site_implementation_exclusions) {
    if (typeof excluded !== 'string' || !excluded.startsWith('docs/')) fail(`invalid site implementation exclusion: ${excluded}`);
  }
  return manifest;
}

function mappedPath(root, base, relPath) {
  const basePath = path.resolve(root, base);
  const candidate = path.resolve(basePath, relPath);
  if (candidate !== basePath && !candidate.startsWith(`${basePath}${path.sep}`)) {
    fail(`mapped path escapes ${base}: ${relPath}`);
  }
  return candidate;
}

function createFsIo() {
  return {
    read(filePath) {
      try {
        return fs.readFileSync(filePath);
      } catch (error) {
        if (error && error.code === 'ENOENT') return null;
        throw error;
      }
    },
    listContentFiles(basePath) {
      return fs.readdirSync(basePath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(basePath, entry.name, 'index.md')))
        .map((entry) => `${entry.name}/index.md`)
        .sort();
    },
    applyAtomically(changes) {
      const snapshots = new Map(changes.map((change) => [change.generatedPath, change.generated]));
      for (const change of changes) {
        const parent = path.dirname(change.generatedPath);
        let existingParent = parent;
        while (!fs.existsSync(existingParent)) {
          const next = path.dirname(existingParent);
          if (next === existingParent) fail(`no writable parent for generated output: ${change.relPath}`);
          existingParent = next;
        }
        const parentStat = fs.lstatSync(existingParent);
        if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
          fail(`generated parent is not a regular directory: ${change.relPath}`);
        }
        fs.accessSync(existingParent, fs.constants.W_OK);
        if (fs.existsSync(change.generatedPath)) {
          const targetStat = fs.lstatSync(change.generatedPath);
          if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
            fail(`generated target is not a regular file: ${change.relPath}`);
          }
          fs.accessSync(change.generatedPath, fs.constants.W_OK);
        }
      }

      const touched = [];
      try {
        for (const change of changes) {
          fs.mkdirSync(path.dirname(change.generatedPath), { recursive: true });
          touched.push(change.generatedPath);
          fs.writeFileSync(change.generatedPath, change.source);
        }
        for (const change of changes) {
          const written = fs.readFileSync(change.generatedPath);
          if (!change.source.equals(written)) fail(`write verification failed: ${change.relPath}`);
        }
      } catch (error) {
        const rollbackErrors = [];
        for (const target of [...touched].reverse()) {
          try {
            const previous = snapshots.get(target);
            if (previous === null) {
              if (fs.existsSync(target)) fs.unlinkSync(target);
            } else {
              fs.writeFileSync(target, previous);
            }
          } catch (rollbackError) {
            rollbackErrors.push(`${target}: ${rollbackError.message}`);
          }
        }
        if (rollbackErrors.length > 0) {
          fail(`${error.message}; rollback also failed: ${rollbackErrors.join('; ')}`);
        }
        throw error;
      }
    },
  };
}

function synchronize(root, manifest, io, write) {
  validateManifest(manifest);
  const canonicalBase = path.resolve(root, manifest.canonical_root);
  const discovered = io.listContentFiles(canonicalBase);
  const mapped = new Set(manifest.files);
  const unmapped = discovered.filter((file) => !mapped.has(file));
  const undiscovered = manifest.files.filter((file) => !discovered.includes(file));
  if (unmapped.length > 0 || undiscovered.length > 0) {
    fail(`manifest coverage mismatch; unmapped canonical: ${unmapped.join(', ') || 'none'}; missing canonical: ${undiscovered.join(', ') || 'none'}`);
  }
  const generatedBase = path.resolve(root, manifest.generated_root);
  const unmappedGenerated = io.listContentFiles(generatedBase).filter((file) => !mapped.has(file));
  if (unmappedGenerated.length > 0) {
    fail(`manifest coverage mismatch; unmapped generated content: ${unmappedGenerated.join(', ')}`);
  }
  const differences = [];
  const changes = [];
  for (const relPath of manifest.files) {
    const sourcePath = mappedPath(root, manifest.canonical_root, relPath);
    const generatedPath = mappedPath(root, manifest.generated_root, relPath);
    const source = io.read(sourcePath);
    if (source === null) fail(`canonical source is missing: ${relPath}`);
    const generated = io.read(generatedPath);
    if (generated === null || !source.equals(generated)) {
      differences.push(relPath);
      changes.push({ relPath, generatedPath, source, generated });
    }
  }
  if (write && changes.length > 0) io.applyAtomically(changes);
  return differences;
}

function selfTestManifest() {
  return {
    version: 2,
    canonical_root: 'src',
    generated_root: 'docs',
    migration_batches: [{
      id: 'test-batch',
      source_issue: 1,
      baseline_commit: 'a'.repeat(40),
      files: ['chapter-one/index.md'],
    }],
    files: ['chapter-one/index.md'],
    site_implementation_exclusions: ['docs/_layouts/**'],
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function expectFailure(name, action, expected) {
  let caught;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  if (!caught || !caught.message.includes(expected)) {
    fail(`self-test did not reject ${name}; got: ${caught ? caught.message : 'no error'}`);
  }
}

function createMemoryIo(initial, options = {}) {
  const files = new Map(Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]));
  return {
    read(filePath) {
      const value = files.get(filePath);
      return value === undefined ? null : Buffer.from(value);
    },
    listContentFiles(basePath) {
      const prefix = `${basePath}${path.sep}`;
      return [...files.keys()]
        .filter((filePath) => filePath.startsWith(prefix))
        .map((filePath) => path.relative(basePath, filePath).split(path.sep).join('/'))
        .filter((relPath) => /^[^/]+\/index\.md$/.test(relPath))
        .sort();
    },
    applyAtomically(changes) {
      const snapshot = new Map([...files].map(([key, value]) => [key, Buffer.from(value)]));
      for (const change of changes) {
        if ((options.preflightReject || []).includes(change.generatedPath)) {
          fail(`generated target failed preflight: ${change.relPath}`);
        }
      }
      try {
        for (const change of changes) {
          files.set(change.generatedPath, Buffer.from(change.source));
          if ((options.writeReject || []).includes(change.generatedPath)) {
            fail(`generated target failed during write: ${change.relPath}`);
          }
        }
        for (const change of changes) {
          const written = files.get(change.generatedPath);
          if (!written || !change.source.equals(written)) fail(`write verification failed: ${change.relPath}`);
        }
      } catch (error) {
        files.clear();
        for (const [key, value] of snapshot) files.set(key, Buffer.from(value));
        throw error;
      }
    },
  };
}

function runSelfTest() {
  const baseline = selfTestManifest();
  validateManifest(baseline);

  const duplicate = clone(baseline);
  duplicate.files.push(duplicate.files[0]);
  expectFailure('duplicate manifest file', () => validateManifest(duplicate), 'duplicate');

  const traversal = clone(baseline);
  traversal.files = ['../chapter-one/index.md'];
  traversal.migration_batches[0].files = [...traversal.files];
  expectFailure('path traversal', () => validateManifest(traversal), 'must not escape');

  const invalidRoot = clone(baseline);
  invalidRoot.generated_root = 'public';
  expectFailure('root change', () => validateManifest(invalidRoot), 'must remain src/docs');

  const batchMismatch = clone(baseline);
  batchMismatch.migration_batches[0].files = ['chapter-two/index.md'];
  expectFailure('batch mapping mismatch', () => validateManifest(batchMismatch), 'exactly match');

  const duplicateBatch = clone(baseline);
  duplicateBatch.migration_batches.push(clone(duplicateBatch.migration_batches[0]));
  expectFailure('duplicate batch id', () => validateManifest(duplicateBatch), 'batch ids must be unique');

  const root = path.resolve('/workspace');
  const sourcePath = path.join(root, 'src/chapter-one/index.md');
  const generatedPath = path.join(root, 'docs/chapter-one/index.md');
  const driftIo = createMemoryIo({ [sourcePath]: 'canonical', [generatedPath]: 'stale' });
  const drift = synchronize(root, baseline, driftIo, false);
  if (drift.length !== 1 || drift[0] !== 'chapter-one/index.md') fail('self-test did not detect drift');
  synchronize(root, baseline, driftIo, true);
  if (synchronize(root, baseline, driftIo, false).length !== 0) fail('self-test write did not converge');

  const missingGeneratedIo = createMemoryIo({ [sourcePath]: 'canonical' });
  if (synchronize(root, baseline, missingGeneratedIo, false).length !== 1) fail('self-test did not detect missing generated output');
  synchronize(root, baseline, missingGeneratedIo, true);
  if (synchronize(root, baseline, missingGeneratedIo, false).length !== 0) fail('self-test did not create missing generated output');

  const twoFileManifest = clone(baseline);
  twoFileManifest.files.push('chapter-two/index.md');
  twoFileManifest.migration_batches[0].files.push('chapter-two/index.md');
  const secondSourcePath = path.join(root, 'src/chapter-two/index.md');
  const secondGeneratedPath = path.join(root, 'docs/chapter-two/index.md');
  const atomicIo = createMemoryIo({
    [sourcePath]: 'canonical-one',
    [generatedPath]: 'stale-one',
    [secondSourcePath]: 'canonical-two',
    [secondGeneratedPath]: 'stale-two',
  }, { writeReject: [secondGeneratedPath] });
  expectFailure('later write failure', () => synchronize(root, twoFileManifest, atomicIo, true), 'failed during write');
  if (atomicIo.read(generatedPath).toString() !== 'stale-one' || atomicIo.read(secondGeneratedPath).toString() !== 'stale-two') {
    fail('self-test did not roll back every generated file after a later write failure');
  }

  const unmappedSourcePath = path.join(root, 'src/chapter-two/index.md');
  const unmappedIo = createMemoryIo({
    [sourcePath]: 'canonical',
    [generatedPath]: 'canonical',
    [unmappedSourcePath]: 'unmapped',
  });
  expectFailure('unmapped canonical source', () => synchronize(root, baseline, unmappedIo, false), 'unmapped canonical');

  const unmappedGeneratedPath = path.join(root, 'docs/chapter-two/index.md');
  const unmappedGeneratedIo = createMemoryIo({
    [sourcePath]: 'canonical',
    [generatedPath]: 'canonical',
    [unmappedGeneratedPath]: 'unmapped',
  });
  expectFailure('unmapped generated content', () => synchronize(root, baseline, unmappedGeneratedIo, false), 'unmapped generated');

  const missingSourceIo = createMemoryIo({});
  expectFailure('missing canonical source', () => synchronize(root, baseline, missingSourceIo, false), 'missing canonical');

  console.log('OK: canonical content sync self-test (11 negative/convergence cases)');
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`failed to load canonical content manifest ${manifestPath}: ${error.message}`);
  }
}

function main() {
  const args = process.argv.slice(2);
  const supported = new Set(['--check', '--write', '--self-test']);
  if (args.some((arg) => !supported.has(arg)) || new Set(args).size !== args.length || args.length > 1) {
    console.error('Usage: node scripts/sync-canonical-content.js [--check|--write|--self-test]');
    process.exit(2);
  }
  if (args[0] === '--self-test') {
    runSelfTest();
    return;
  }
  const write = args[0] === '--write';
  const manifest = loadManifest();
  const differences = synchronize(repositoryRoot, manifest, createFsIo(), write);
  if (differences.length > 0) {
    console.log(`${write ? 'synchronized' : 'drift detected'}: ${differences.join(', ')}`);
    if (!write) process.exit(1);
  } else {
    console.log(`canonical content is synchronized (${manifest.files.length} files)`);
  }
}

try {
  main();
} catch (error) {
  console.error(`canonical content sync failed: ${error.message}`);
  process.exit(1);
}
