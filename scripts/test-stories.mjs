import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { evaluateStories, validateCatalog } from './story-results.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--require-acceptance')) throw new Error('Only --require-acceptance is supported');
const strict = args.includes('--require-acceptance');
const catalog = JSON.parse(readFileSync(join(root, 'tests/stories/catalog.json'), 'utf8'));
validateCatalog(catalog);
const files = [...new Set(catalog.stories.flatMap(story => story.scenarios.flatMap(scenario => scenario.tests?.map(test => test.file) ?? [])))];
for (const file of files) if (!existsSync(join(root, file))) throw new Error(`Missing test file: ${file}`);

// Content fingerprint also covers uncommitted/new tests, specs and workflow edits.
// Acceptance is stored outside these inputs to avoid a self-referential hash.
const tracked = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--',
  'src', 'tests', 'scripts', 'AGENTS.md', 'README.md', 'package.json', 'package-lock.json', 'tsup.config.ts', 'vitest.config.ts', '.github/workflows'],
{ cwd: root, encoding: 'utf8' });
if (tracked.status !== 0) throw new Error('Cannot fingerprint candidate files');
const hash = createHash('sha256');
for (const file of [...new Set(tracked.stdout.split('\0').filter(Boolean))].sort()) {
  hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0');
}
const candidate = hash.digest('hex');
const folder = join(root, '.development', `stories-${Date.now()}-${process.pid}`);
mkdirSync(folder, { recursive: true });
const reportPath = join(folder, 'vitest.json');
const run = spawnSync(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), 'run', ...files,
  '--reporter=json', `--outputFile=${reportPath}`], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
writeFileSync(join(folder, 'test.log'), `${run.stdout ?? ''}\n${run.stderr ?? ''}`);
if (run.error || !existsSync(reportPath)) {
  console.error(`Story tests did not produce a report. See ${folder}/test.log`);
  process.exit(1);
}
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const acceptancePath = join(root, '.development/story-acceptance.json');
const acceptance = existsSync(acceptancePath) ? JSON.parse(readFileSync(acceptancePath, 'utf8')) : {};
const result = evaluateStories(catalog, report, { root, candidate, acceptance });
if (run.status !== 0) { result.automatedPassed = false; result.acceptanceComplete = false; }
result.node = process.version;
result.checkedAt = new Date().toISOString();
result.tests = report.numTotalTests;
writeFileSync(join(folder, 'results.json'), JSON.stringify(result, null, 2) + '\n');
for (const scenario of result.scenarios) console.log(`${scenario.status.toUpperCase()} ${scenario.id} (${scenario.kind})`);
console.log(`Automated: ${result.automatedPassed ? 'PASS' : 'FAIL'}; acceptance: ${result.acceptanceComplete ? 'COMPLETE' : 'INCOMPLETE'}`);
console.log(`Candidate: ${candidate}\nReport: ${folder}/results.json`);
process.exitCode = result.automatedPassed && (!strict || result.acceptanceComplete) ? 0 : 1;
