import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve("out");
const manifestPath = path.join(outputDirectory, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

assert.equal(manifest.manifest_version, 3, "manifest must use MV3");
assert.deepEqual(manifest.permissions.sort(), ["scripting", "storage"]);
assert.deepEqual(manifest.host_permissions, ["https://*.instagram.com/*"]);
assert.deepEqual(manifest.web_accessible_resources, [{
  resources: ["fonts/Tiny5-Regular.ttf"],
  matches: ["https://*.instagram.com/*"],
}]);
assert.equal(
  manifest.content_security_policy.extension_pages,
  "script-src 'self'; object-src 'self'",
);
assert.doesNotMatch(manifest.content_security_policy.extension_pages, /unsafe-inline|unsafe-eval/);

const requiredFiles = [
  manifest.action.default_popup,
  manifest.background.service_worker,
  ...manifest.content_scripts.flatMap((script) => [...script.js, ...script.css]),
  ...manifest.web_accessible_resources.flatMap((resource) => resource.resources),
  ...Object.values(manifest.icons),
];
for (const relativePath of requiredFiles) {
  assert.ok(fs.existsSync(path.join(outputDirectory, relativePath)), `missing ${relativePath}`);
}

assert.ok(fs.existsSync(path.join(outputDirectory, "fonts", "Tiny5-OFL.txt")), "missing Tiny5 license");

const htmlFiles = fs.readdirSync(outputDirectory)
  .filter((file) => file.endsWith(".html"))
  .map((file) => path.join(outputDirectory, file));

for (const htmlFile of htmlFiles) {
  const html = fs.readFileSync(htmlFile, "utf8");
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  assert.doesNotMatch(html, /\bon(?:click|change|input|load|error)\s*=/i);
  assert.doesNotMatch(html, /\/_next\//);

  for (const match of html.matchAll(/<script[^>]*\bsrc="([^"]+)"/gi)) {
    const scriptPath = path.join(outputDirectory, match[1].replace(/^\//, ""));
    assert.ok(fs.existsSync(scriptPath), `missing popup script ${match[1]}`);
  }
}

console.log(`Validated ${requiredFiles.length} manifest assets and ${htmlFiles.length} CSP-safe HTML files.`);
