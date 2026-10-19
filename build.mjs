import * as esbuild from 'esbuild';
import { execFileSync } from 'child_process';
import path from 'path';

console.log('Building content script with esbuild...');

try {
  esbuild.buildSync({
    entryPoints: ['src/content/index.tsx'],
    bundle: true,
    outfile: 'public/content.js',
    format: 'iife',
    target: ['chrome100'],
    minify: false,
  });
  console.log('Content script built successfully.');

  console.log('Building Tailwind CSS...');
  execFileSync(
    process.execPath,
    [
      path.join('node_modules', '@tailwindcss', 'cli', 'dist', 'index.mjs'),
      '-i',
      path.join('src', 'content', 'styles.css'),
      '-o',
      path.join('public', 'content.css'),
    ],
    { stdio: 'inherit' },
  );
} catch (e) {
  console.error('Failed to build content script:', e);
  process.exit(1);
}
