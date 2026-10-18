import { build } from "esbuild";
import { mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const coverage = args.includes("--coverage");
const filters = args.filter((arg) => arg !== "--coverage");
const files = (await readdir(join(root, "tests")))
  .filter((file) => file.endsWith(".test.ts"))
  .filter((file) => filters.length === 0 || filters.includes(file.replace(/\.test\.ts$/, "")))
  .sort();
if (files.length === 0) throw new Error("No matching test files");

// Bundle TypeScript with the project's existing compiler; no extra test dependency.
const outputDir = await realpath(await mkdtemp(join(tmpdir(), "notion-tests-")));
try {
  await build({
    absWorkingDir: root,
    entryPoints: files.map((file) => join(root, "tests", file)),
    bundle: true,
    platform: "node",
    format: "esm",
    outdir: outputDir,
    outExtension: { ".js": ".mjs" },
    sourcemap: coverage ? false : "inline",
    loader: { ".md": "text" }
  });
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "--enable-source-maps",
      "--test",
      // Bundles contain production code too; explicitly include them because Node
      // otherwise excludes *.test.mjs and emits a misleading empty 100% report.
      ...(coverage ? [
        "--experimental-test-coverage",
        `--test-coverage-include=${outputDir}/*.mjs`,
        "--test-coverage-exclude=**/node_modules/**"
      ] : []),
      ...files.map((file) => join(outputDir, file.replace(/\.ts$/, ".mjs")))
    ], { cwd: root, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  process.exitCode = code;
} finally {
  // Only remove this run's temporary compiled tests, never source files.
  await rm(outputDir, { recursive: true, force: true });
}
