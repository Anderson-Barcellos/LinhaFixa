import { gzipSync } from 'node:zlib';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function collectInitialJavaScript(manifest) {
  const visited = new Set();
  const files = new Set();
  const visit = key => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Vite manifest references missing chunk ${key}`);
    if (chunk.file?.endsWith('.js')) files.add(chunk.file);
    for (const imported of chunk.imports ?? []) visit(imported);
  };
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry);
  if (entries.length !== 1) throw new Error(`Expected one Vite entry, found ${entries.length}`);
  visit(entries[0][0]);
  return [...files].sort();
}

export async function measureInitialGzipBytes({ manifestPath, distDir }) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const files = collectInitialJavaScript(manifest);
  let bytes = 0;
  for (const file of files) {
    bytes += gzipSync(await readFile(resolve(distDir, file))).byteLength;
  }
  return { files, bytes };
}

export function assertBundleBudget(actualBytes, budgetBytes) {
  if (actualBytes > budgetBytes) {
    throw new Error(`Initial JavaScript ${actualBytes} bytes exceeds budget ${budgetBytes} bytes`);
  }
}

async function main() {
  const distDir = resolve(process.argv[2] ?? 'dist');
  const budgetBytes = Number(process.argv[3] ?? '180000');
  const result = await measureInitialGzipBytes({
    manifestPath: resolve(distDir, '.vite/manifest.json'),
    distDir,
  });
  assertBundleBudget(result.bytes, budgetBytes);
  console.log(`Initial JavaScript: ${result.bytes}/${budgetBytes} gzip bytes (${result.files.join(', ')})`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
