import { join } from 'path';
import { homedir } from 'os';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let version = '0.1.0';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // Use default version
}

const defaultDir = join(homedir(), '.49agents');

export const config = {
  cloudUrl: process.env.TC_CLOUD_URL || 'ws://localhost:1071',
  configDir: process.env.TC_CONFIG_DIR || defaultDir,
  dataDir: process.env.TC_CONFIG_DIR || defaultDir,
  version,
};
