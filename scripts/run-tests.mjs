import * as esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const workspace = process.cwd();
const outputDirectory = path.resolve(workspace, ".tmp-tests");
const outputFile = path.join(outputDirectory, "logic.test.mjs");

if (!outputDirectory.startsWith(`${path.resolve(workspace)}${path.sep}`)) {
  throw new Error("Refusing to use a test output directory outside the workspace");
}

fs.rmSync(outputDirectory, { recursive: true, force: true });
fs.mkdirSync(outputDirectory, { recursive: true });

try {
  esbuild.buildSync({
    entryPoints: [path.join("tests", "logic.test.ts")],
    bundle: true,
    outfile: outputFile,
    platform: "node",
    format: "esm",
    target: ["node20"],
    packages: "external",
  });

  const result = spawnSync(process.execPath, ["--test", outputFile], {
    cwd: workspace,
    stdio: "inherit",
  });
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(outputDirectory, { recursive: true, force: true });
}
