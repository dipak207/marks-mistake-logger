import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const tscScript = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
execFileSync(process.execPath, [tscScript, '-p', path.join(root, 'tsconfig.json')], {
  cwd: root,
  stdio: 'inherit'
});

await cp(path.join(root, 'public', 'manifest.json'), path.join(dist, 'manifest.json'));
await cp(path.join(root, 'src', 'popup', 'popup.html'), path.join(dist, 'popup', 'popup.html'));
await cp(path.join(root, 'src', 'popup', 'popup.css'), path.join(dist, 'popup', 'popup.css'));
await cp(path.join(root, 'src', 'onboarding', 'onboarding.html'), path.join(dist, 'onboarding', 'onboarding.html'));
await cp(path.join(root, 'src', 'onboarding', 'onboarding.css'), path.join(dist, 'onboarding', 'onboarding.css'));

console.log('Built extension into dist/');
