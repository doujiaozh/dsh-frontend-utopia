/**
 * utopia 测试驱动：编译后扫描 dist-test 下所有包的 .test.js，逐个加载后统一 runAll。
 */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const distTest = join(root, 'dist-test');

function walk(dir, acc = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, acc);
    else if (name.endsWith('.test.js')) acc.push(full);
  }
  return acc;
}

const files = walk(join(distTest, 'packages'));
if (files.length === 0) {
  console.error('没有找到编译后的测试文件，请先执行: npm run build && npm run build:test');
  process.exit(1);
}

for (const f of files.sort()) {
  await import(pathToFileURL(f).href);
  console.log(`· 载入 ${f.replace(root, '').replace(/\\/g, '/')}`);
}

const { runAll } = await import(pathToFileURL(join(distTest, 'scripts', 'utest.js')).href);
const { failed } = await runAll();
process.exitCode = failed > 0 ? 1 : 0;
