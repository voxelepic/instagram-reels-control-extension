import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
assert.ok(fs.existsSync(chromePath), "Chrome is required for the browser smoke test");

const workspace = process.cwd();
const profileDirectory = path.resolve(workspace, ".tmp-browser-profile");
if (!profileDirectory.startsWith(`${path.resolve(workspace)}${path.sep}`)) {
  throw new Error("Refusing to use a browser profile outside the workspace");
}
fs.rmSync(profileDirectory, { recursive: true, force: true });

try {
  const fixtureUrl = pathToFileURL(path.resolve("tests", "browser-fixture.html")).href;
  const result = spawnSync(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-gpu",
    "--no-default-browser-check",
    "--no-first-run",
    "--allow-file-access-from-files",
    `--user-data-dir=${profileDirectory}`,
    "--dump-dom",
    "--virtual-time-budget=3500",
    fixtureUrl,
  ], { encoding: "utf8", timeout: 20_000 });

  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /data-test-status="pass"/);
  const details = result.stdout.match(/data-test-result="([^"]+)"/)?.[1];
  console.log("Browser smoke test:", details ? decodeURIComponent(details) : "passed");
} finally {
  fs.rmSync(profileDirectory, { recursive: true, force: true });
}
