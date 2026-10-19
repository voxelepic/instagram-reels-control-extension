import fs from 'fs';
import path from 'path';

const outDir = path.join(process.cwd(), 'out');
const nextDir = path.join(outDir, '_next');
const assetsDir = path.join(outDir, 'assets');

if (fs.existsSync(nextDir)) {
  fs.renameSync(nextDir, assetsDir);
}

function replaceInFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      replaceInFiles(filePath);
    } else if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      let content = fs.readFileSync(filePath, 'utf8');
      let changed = false;
      if (content.includes('/_next/')) {
        content = content.replace(/\/_next\//g, '/assets/');
        changed = true;
      }
      if (content.includes('\\_next\\')) {
        content = content.replace(/\\_next\\/g, '\\assets\\');
        changed = true;
      }
      if (content.includes('"/_next"')) {
        content = content.replace(/"\/_next"/g, '"/assets"');
        changed = true;
      }
      if (changed) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
    }
  }
}

replaceInFiles(outDir);

// Chrome MV3 blocks inline JavaScript in extension pages. Next's static export
// emits inline React-flight data scripts, so move them to extension-owned files
// without weakening the manifest CSP with unsafe-inline.
const inlineScriptsDir = path.join(assetsDir, 'inline');
let inlineScriptCount = 0;

function externalizeInlineScripts(dir) {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      externalizeInlineScripts(filePath);
      continue;
    }
    if (!filePath.endsWith('.html')) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    content = content.replace(
      /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
      (_match, attributes, source) => {
        if (!source.trim()) return _match;
        fs.mkdirSync(inlineScriptsDir, { recursive: true });
        const outputName = `next-inline-${inlineScriptCount++}.js`;
        fs.writeFileSync(path.join(inlineScriptsDir, outputName), source, 'utf8');
        changed = true;
        return `<script${attributes} src="/assets/inline/${outputName}"></script>`;
      },
    );
    if (changed) fs.writeFileSync(filePath, content, 'utf8');
  }
}

externalizeInlineScripts(outDir);

// Cleanup any other files or directories starting with "_"
const allFiles = fs.readdirSync(outDir);
for (const file of allFiles) {
  if (file.startsWith('_')) {
    const filePath = path.join(outDir, file);
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath, { recursive: true, force: true });
    }
  }
}

console.log('Prepared CSP-safe Chrome Extension assets and cleaned up underscored files.');
