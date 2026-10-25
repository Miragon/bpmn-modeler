// Runs `test:vscode` in a Linux container under Xvfb, so no VS Code window
// opens on the host and nothing takes the focus.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import console from "node:console";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, "../../../..");
const containerfile = join(here, "Containerfile");
const hostResults = join(repositoryRoot, "test-results/vscode-smoke");

const VOLUMES = {
    vscode: "bpmn-modeler-vscode-smoke-vscode:/root/.cache/bpmn-modeler-vscode-smoke",
    yarn: "bpmn-modeler-vscode-smoke-yarn:/root/.yarn/berry",
};

const CONTAINER_SCRIPT = `set -euo pipefail
say() { echo "[vscode-smoke:container] $*"; }
step() {
  local name=$1; shift
  local start=$(date +%s)
  if ! "$@" > "/tmp/$name.log" 2>&1; then
    tail -n 60 "/tmp/$name.log"
    say "$name failed after $(( $(date +%s) - start )) s"
    exit 1
  fi
  say "$name in $(( $(date +%s) - start )) s"
}
mkdir -p /work
tar -C /repo --null -T /files.txt -cf - | tar -C /work -xf -
cd /work
# The root \`prepare\` script configures Git hooks and fails outside a repository.
git init -q
step install corepack yarn install --immutable
step build corepack yarn build
set +e
xvfb-run -a -s "-screen 0 1920x1200x24" corepack yarn workspace vs-code-bpmn-modeler test:vscode
code=$?
set -e
if [ -d test-results/vscode-smoke ]; then cp -R test-results/vscode-smoke/. /results/; fi
if [ -n "$HOST_UID" ]; then chown -R "$HOST_UID:$HOST_GID" /results; fi
exit "$code"
`;

function isOnPath(command) {
    return spawnSync(command, ["--version"], { stdio: "ignore" }).status === 0;
}

function run(command, args) {
    return new Promise((done, fail) => {
        const child = spawn(command, args, { stdio: "inherit" });
        child.once("error", fail);
        child.once("close", (code) => done(code ?? 1));
    });
}

/** Tracked and untracked files minus ignored and deleted ones: the working tree as Git sees it. */
function workingTreeFiles() {
    const git = (...args) =>
        execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", maxBuffer: 64 << 20 })
            .split("\0")
            .filter(Boolean);
    const deleted = new Set(git("ls-files", "-z", "--deleted"));
    return git("ls-files", "-z", "--cached", "--others", "--exclude-standard").filter(
        (file) => !deleted.has(file),
    );
}

const engine = process.env.CONTAINER_ENGINE || (isOnPath("podman") ? "podman" : "docker");
const recipeHash = createHash("sha256")
    .update(readFileSync(containerfile))
    .digest("hex")
    .slice(0, 12);
const image = `localhost/bpmn-modeler-vscode-smoke:${recipeHash}`;

if (spawnSync(engine, ["image", "inspect", image], { stdio: "ignore" }).status !== 0) {
    console.log(`[vscode-smoke] building ${image} with ${engine}`);
    const code = await run(engine, ["build", "--tag", image, "--file", containerfile, here]);
    if (code !== 0) process.exit(code);
}

rmSync(hostResults, { recursive: true, force: true });
mkdirSync(hostResults, { recursive: true });
const listDirectory = mkdtempSync(join(tmpdir(), "bpmn-modeler-vscode-smoke-"));
const fileList = join(listDirectory, "files.txt");
writeFileSync(fileList, workingTreeFiles().join("\0"));

const forwarded = ["VSCODE_SMOKE_VERSION"].filter((name) => process.env[name]);
const started = Date.now();
const exitCode = await run(engine, [
    "run",
    "--rm",
    // Reaps VS Code's many processes and passes Ctrl+C on.
    "--init",
    // Chromium's shared memory; the 64 MB default crashes renderers.
    "--shm-size=1g",
    // A read-only bind mount needs no SELinux relabel of the whole repository.
    "--security-opt",
    "label=disable",
    "--volume",
    `${repositoryRoot}:/repo:ro`,
    "--volume",
    `${fileList}:/files.txt:ro`,
    "--volume",
    `${hostResults}:/results`,
    "--volume",
    VOLUMES.vscode,
    "--volume",
    VOLUMES.yarn,
    "--env",
    `HOST_UID=${process.getuid?.() ?? ""}`,
    "--env",
    `HOST_GID=${process.getgid?.() ?? ""}`,
    ...forwarded.flatMap((name) => ["--env", name]),
    image,
    "bash",
    "-c",
    CONTAINER_SCRIPT,
]);
rmSync(listDirectory, { recursive: true, force: true });
console.log(
    `[vscode-smoke] exit code ${exitCode} after ${Math.round((Date.now() - started) / 1000)} s; results in ${hostResults}`,
);
process.exit(exitCode);
