import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const tarballArgument = process.argv[2];

function fail(message) {
    console.error(`smoke-packed-consumer: ${message}`);
    process.exit(1);
}

if (!tarballArgument) {
    fail("usage: node scripts/smoke-packed-consumer.mjs <packed-tarball-path>");
}

const tarball = resolve(tarballArgument);
if (!existsSync(tarball)) fail(`tarball does not exist: ${tarball}`);

function run(command, args, cwd) {
    const result = spawnSync(command, args, { cwd, stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
    }
}

function testInstallStrategy(installStrategy) {
    const project = mkdtempSync(joinTemporaryPrefix(installStrategy));
    try {
        writeFileSync(
            resolve(project, "package.json"),
            `${JSON.stringify({ name: `bpmn-modeler-smoke-${installStrategy}`, private: true, type: "module" }, null, 2)}\n`,
        );
        copyFileSync(
            resolve(scriptDirectory, "smoke-consumer.mjs"),
            resolve(project, "smoke-consumer.mjs"),
        );

        console.log(`smoke-packed-consumer: installing ${installStrategy} consumer in ${project}`);
        run(
            "npm",
            [
                "install",
                tarball,
                "esbuild@0.28.2",
                `--install-strategy=${installStrategy}`,
                "--no-audit",
                "--no-fund",
            ],
            project,
        );
        run(process.execPath, ["smoke-consumer.mjs"], project);
    } catch (error) {
        throw new Error(`${installStrategy} consumer failed: ${error.message}`, { cause: error });
    } finally {
        rmSync(project, { recursive: true, force: true });
    }
}

try {
    for (const installStrategy of ["hoisted", "nested"]) {
        testInstallStrategy(installStrategy);
    }
} catch (error) {
    fail(error.message);
}

console.log("smoke-packed-consumer: hoisted and nested packed installs passed.");

function joinTemporaryPrefix(installStrategy) {
    return resolve(tmpdir(), `bpmn-modeler-packed-smoke-${installStrategy}-`);
}
