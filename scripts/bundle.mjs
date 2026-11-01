/**
 * 浏览器化打包：借助 packages/build（esbuild-wasm 优先）把五个运行时包打成
 * dist/browser/*.js（ESM）以及一个 IIFE 全量包 utopia.full.js。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

let build;
try {
  ({ build } = await import(join(root, 'packages/build/dist/index.js')));
} catch {
  console.error('packages/build 尚未构建，请先执行: npm run build');
  process.exit(1);
}

const browserOut = join(root, 'dist/browser');
rmSync(browserOut, { recursive: true, force: true });
mkdirSync(browserOut, { recursive: true });

const pkgs = ['state', 'request', 'ui', 'utils', 'cross'];

// 分包 ESM
await build({
  entry: Object.fromEntries(pkgs.map(p => [p, join(root, `packages/${p}/src/index.ts`)])),
  outdir: 'dist/browser',
  format: 'esm',
  target: 'es2019',
  platform: 'browser',
  minify: true,
  sourcemap: true,
});

// 全量 IIFE（globalThis.Utopia.state / .request ...）
const tmp = join(root, '.utopia-tmp');
mkdirSync(tmp, { recursive: true });
const entry = join(tmp, 'browser-entry.ts');
writeFileSync(entry, [
  ...pkgs.map(p => `export * as ${p} from '../packages/${p}/src/index.js';`),
  ''
].join('\n').replace(/\.js';/g, ".ts';"));

await build({
  entry,
  outfile: 'dist/browser/utopia.full.js',
  format: 'iife',
  library: 'Utopia',
  target: 'es2019',
  platform: 'browser',
  minify: true,
  sourcemap: true,
});

rmSync(tmp, { recursive: true, force: true });
console.log('浏览器包已输出到 dist/browser/');
