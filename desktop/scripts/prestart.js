#!/usr/bin/env node
// Prepares cloud and agent dependencies for dev mode.
// Records the current node path so main.js spawns the same node that npm
// used to install, preventing native module ABI mismatches (better-sqlite3).
import { execFileSync, execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');
const npmBin = join(dirname(process.execPath), 'npm');

// Record the node path for main.js to use when spawning cloud/agent.
writeFileSync('/tmp/49agents-node-path.txt', process.execPath);
process.stdout.write(`[prestart] Using node: ${process.execPath}\n`);

for (const dir of ['cloud', 'agent']) {
  const cwd = join(root, dir);
  process.stdout.write(`[prestart] npm install in ${dir}...\n`);
  execFileSync(npmBin, ['install', '--silent'], { cwd, stdio: 'inherit' });
}
