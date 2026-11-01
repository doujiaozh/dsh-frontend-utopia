import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const targets = [
  'dist',
  'dist-test',
  '.utopia-tmp',
  'packages/*/dist',
];

for (const t of targets) {
  rmSync(join(root, t), { recursive: true, force: true });
}
console.log('已清理构建产物（dist / dist-test / .utopia-tmp）');
