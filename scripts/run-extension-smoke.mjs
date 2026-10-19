import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const browserPath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const workspace = process.cwd();
const extensionDirectory = path.resolve(workspace, "out");
const profileDirectory = path.resolve(workspace, ".tmp-extension-profile");

assert.ok(fs.existsSync(browserPath), "A Chromium browser is required for the extension smoke test");
assert.ok(fs.existsSync(path.join(extensionDirectory, "manifest.json")), "Build the extension first");
if (!profileDirectory.startsWith(`${path.resolve(workspace)}${path.sep}`)) {
  throw new Error("Refusing to use an extension profile outside the workspace");
}
fs.rmSync(profileDirectory, { recursive: true, force: true });

const browser = spawn(browserPath, [
  "--disable-background-networking",
  "--disable-default-apps",
  "--no-default-browser-check",
  "--no-first-run",
  `--disable-extensions-except=${extensionDirectory}`,
  `--load-extension=${extensionDirectory}`,
  "--remote-debugging-port=0",
  "--window-position=-32000,-32000",
  "--window-size=800,600",
  `--user-data-dir=${profileDirectory}`,
  "about:blank",
], { stdio: "ignore" });

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForFile(filePath, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForExtensionId(port, timeout = 10_000) {
  const preferencesPath = path.join(profileDirectory, "Default", "Preferences");
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const extensionTarget = targets.find((target) =>
        target.type === "service_worker" && /\/background\.js$/.test(target.url ?? "")
      );
      const targetId = extensionTarget?.url?.match(/^chrome-extension:\/\/([^/]+)/)?.[1];
      if (targetId) return targetId;
    } catch {
      // DevTools can briefly reject requests while Chrome is starting; retry.
    }

    if (fs.existsSync(preferencesPath)) {
      try {
        const preferences = JSON.parse(fs.readFileSync(preferencesPath, "utf8"));
        const entries = Object.entries(preferences.extensions?.settings ?? {});
        const found = entries.find(([, details]) => {
          const configuredPath = details && typeof details === "object" && "path" in details
            ? path.resolve(String(details.path))
            : "";
          return configuredPath.toLowerCase() === extensionDirectory.toLowerCase();
        });
        if (found) return found[0];
      } catch {
        // Chrome can be writing Preferences while this read occurs; retry.
      }
    }
    await delay(100);
  }
  throw new Error("Timed out discovering the unpacked extension ID");
}

function connectToTarget(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  let nextId = 1;
  const pending = new Map();
  const events = [];

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
      return;
    }
    events.push(message);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    events,
    ready,
    close: () => socket.close(),
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

try {
  const portFile = path.join(profileDirectory, "DevToolsActivePort");
  await waitForFile(portFile);
  const [port] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
  const extensionId = await waitForExtensionId(port);
  const popupUrl = `chrome-extension://${extensionId}/index.html`;
  const response = await fetch(`http://127.0.0.1:${port}/json/new`, {
    method: "PUT",
  });
  assert.ok(response.ok, `Could not create popup target: ${response.status}`);
  const target = await response.json();
  const client = connectToTarget(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Page.navigate", { url: popupUrl });
  await delay(800);

  const evaluation = await client.send("Runtime.evaluate", {
    expression: `(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const storageGet = (defaults) => new Promise((resolve) => chrome.storage.local.get(defaults, resolve));
      const switches = Array.from(document.querySelectorAll('[role="switch"]'));
      const before = await storageGet({ autoScroll: true });
      switches[0]?.click();
      await wait(250);
      const after = await storageGet({ autoScroll: true });
      return {
        title: document.title,
        switches: switches.length,
        sliders: document.querySelectorAll('[role="slider"]').length,
        before: before.autoScroll,
        after: after.autoScroll,
        bodyText: document.body.innerText,
      };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });

  assert.ok(evaluation.result.value, `Popup evaluation failed: ${JSON.stringify(evaluation)}`);
  const popup = evaluation.result.value;
  assert.equal(popup.title, "Instagram Reels Control");
  assert.equal(popup.switches, 4);
  assert.equal(popup.sliders, 2);
  assert.equal(popup.before, true);
  assert.equal(popup.after, false, "popup hydration/click did not persist to chrome.storage");
  assert.match(popup.bodyText, /ReelsControl/);

  const errors = client.events.filter((event) =>
    event.method === "Runtime.exceptionThrown" ||
    (event.method === "Log.entryAdded" && event.params?.entry?.level === "error")
  );
  assert.deepEqual(errors, [], `Popup console errors: ${JSON.stringify(errors)}`);
  client.close();
  console.log(`Extension popup smoke test passed for ${extensionId}.`);
} finally {
  if (browser.pid) {
    spawnSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
  }
  const quotedProfile = `'${profileDirectory.replaceAll("'", "''")}'`;
  spawnSync("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    `$profilePath = ${quotedProfile}; Get-CimInstance Win32_Process -Filter \"Name = 'msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profilePath) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
  ], { stdio: "ignore" });
  await delay(750);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(profileDirectory, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 9) throw error;
      await delay(500);
    }
  }
}
