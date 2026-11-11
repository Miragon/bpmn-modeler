/**
 * A bridge over a temp workspace whose `.bpmnlintrc` extends
 * `plugin:acme/recommended`, with the host's side played through the recorded
 * frames. `bpmnlint-plugin-acme` reports every task with the text its one
 * dependency, `acme-dep`, exports, and appends that text to a log next to the
 * diagram, so a caller sees which bytes ran. Free of Vitest, so the Bun smoke
 * script drives the same workspace.
 */

import { mkdirSync, promises as fs, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { approvalsAfter } from "@miragon/bpmn-modeler-core";

import { createBridge } from "../composition/bridge";
import { PluginApprovalsChangeParams, PluginApprovalsSnapshot } from "../protocol/domain/types";
import { Rpc } from "../transport/adapter/out/Rpc";
import { hostNotification, hostReply, registerParams, waitForFrame } from "./bridgeHarness";

export const ACME_RULE = "acme/task-found";

/** Turned on only by a version installed with `addsRule`. */
export const ACME_ADDED_RULE = "acme/task-added";

export const ACME_NOTICE_MESSAGE =
    "1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped.";

const RAN_LOG = "acme-ran.log";

const BPMN_WITH_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
</bpmn:definitions>`;

export interface Frame {
    readonly id?: number;
    readonly method: string;
    readonly params: Readonly<Record<string, unknown>>;
}

interface PostedMessage {
    readonly type?: string;
    readonly config?: unknown;
    readonly configToken?: string;
    readonly results?: Readonly<Record<string, readonly unknown[]>> | null;
}

const postedMessageOf = (frame: Frame): PostedMessage | undefined =>
    frame.method === "editor/postMessage" ? (frame.params.message as PostedMessage) : undefined;

export interface AcmeBridge {
    readonly rpc: Rpc;
    readonly frames: Frame[];
    /** A realpath, as the rule package ids are. */
    readonly root: string;
    readonly editorId: string;
    readonly acmeDir: string;
    dispose(): Promise<void>;
}

export const isRequest = (method: string) => (frame: Frame) =>
    frame.method === method && frame.id !== undefined;

const isLintResults = (frame: Frame): boolean =>
    postedMessageOf(frame)?.type === "BpmnlintResultsQuery" &&
    postedMessageOf(frame)?.results != null;

const isConfigInstruction = (frame: Frame): boolean =>
    postedMessageOf(frame)?.type === "BpmnlintInPageQuery" &&
    postedMessageOf(frame)?.config != null;

const ACME_MANIFEST = { dependencies: { "acme-dep": "1.0.0" } };

/** The git files on disk, as the testing kit's layout writes them. */
const GIT_FILES = {
    writeFile: (path: string, content: string) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
    },
    createDirectory: (path: string) => mkdirSync(path, { recursive: true }),
};

/** The testing kit imports Vitest, which the Bun smoke must not load, so only a git layout loads it. */
const gitLayout = () => import("@miragon/bpmn-modeler-core/testing");

/** @param git Makes the workspace the main worktree of a repository. */
export async function createAcmeWorkspace({
    git = false,
}: { git?: boolean } = {}): Promise<string> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-rule-packages-")));
    if (git) {
        (await gitLayout()).writeRepository(GIT_FILES, root);
    }
    await installAcme(root);
    return root;
}

/**
 * A linked worktree of the repository at `root`, as `git worktree add` lays it
 * out, with its own install of the rule package.
 * @returns the worktree, a realpath.
 */
export async function addAcmeWorktree(root: string): Promise<string> {
    const worktree = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-rule-worktree-")));
    (await gitLayout()).writeLinkedWorktree(GIT_FILES, root, worktree);
    await installAcme(worktree);
    return worktree;
}

/** An update as a package manager installs it: the manifest names the new version. */
export async function bumpAcmeVersion(root: string, version: string): Promise<void> {
    await fs.writeFile(
        join(root, "node_modules", "bpmnlint-plugin-acme", "package.json"),
        JSON.stringify({ name: "bpmnlint-plugin-acme", version, ...ACME_MANIFEST }),
    );
}

/**
 * A repository whose `node_modules` has pnpm's layout: the package links into
 * its `.pnpm` store folder, where its dependency lies beside it.
 * @returns the workspace, a realpath.
 */
export async function createPnpmAcmeWorkspace(install: AcmeInstall = {}): Promise<string> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-rule-pnpm-")));
    GIT_FILES.createDirectory(join(root, ".git", "objects"));
    await writeAcmeConfig(root);
    await installAcmeWithPnpm(root, "1.0.0", "v1", install);
    return root;
}

export interface AcmeInstall {
    /** The package reaches its rules only through `exports`, which map them into `src/`. */
    readonly exports?: boolean;
    /** Its recommended config turns on {@link ACME_ADDED_RULE}, whose file earlier versions lack. */
    readonly addsRule?: boolean;
}

/** As `pnpm update` does: a new store folder, the link retargeted to it and the old folder removed. */
export async function updateAcmeWithPnpm(
    root: string,
    from: string,
    to: string,
    message: string,
    install: AcmeInstall = {},
): Promise<void> {
    await installAcmeWithPnpm(root, to, message, install);
    await fs.rm(pnpmStoreOf(root, from), { recursive: true, force: true });
}

const pnpmStoreOf = (root: string, version: string) =>
    join(root, "node_modules", ".pnpm", `bpmnlint-plugin-acme@${version}`);

async function installAcmeWithPnpm(
    root: string,
    version: string,
    message: string,
    install: AcmeInstall,
): Promise<void> {
    const storeModules = join(pnpmStoreOf(root, version), "node_modules");
    const packageDir = join(storeModules, "bpmnlint-plugin-acme");
    const exportsMap = install.exports
        ? { exports: { ".": "./index.js", "./rules/*": "./src/rules/*.js" } }
        : {};
    await installPackageAt(
        packageDir,
        "bpmnlint-plugin-acme",
        { ...ACME_MANIFEST, ...exportsMap, version },
        acmeFilesOf(root, install),
    );
    await installPackageAt(
        join(storeModules, "acme-dep"),
        "acme-dep",
        {},
        acmeDependencyOf(message),
    );
    const link = join(root, "node_modules", "bpmnlint-plugin-acme");
    await fs.rm(link, { force: true });
    await fs.symlink(packageDir, link, "dir");
}

async function writeAcmeConfig(root: string): Promise<void> {
    await fs.writeFile(
        join(root, ".bpmnlintrc"),
        JSON.stringify({ extends: "plugin:acme/recommended" }),
    );
}

function acmeFilesOf(
    root: string,
    { exports = false, addsRule = false }: AcmeInstall = {},
): Record<string, string> {
    const rules = [ACME_RULE, ...(addsRule ? [ACME_ADDED_RULE] : [])];
    const ruleFile = `const message = require("acme-dep");
module.exports = () => ({
    check(node, reporter) {
        if (node.$type !== "bpmn:Task") return;
        require("fs").appendFileSync(${JSON.stringify(join(root, RAN_LOG))}, message + "\\n");
        reporter.report(node.id, message);
    },
});`;
    const rulesDir = exports ? "src/rules" : "rules";
    return {
        "index.js": `module.exports = { configs: { recommended: { rules: ${JSON.stringify(Object.fromEntries(rules.map((rule) => [rule, "warn"])))} } } };`,
        ...Object.fromEntries(
            rules.map((rule) => [`${rulesDir}/${rule.slice("acme/".length)}.js`, ruleFile]),
        ),
    };
}

const acmeDependencyOf = (message: string) => ({
    "index.js": `module.exports = ${JSON.stringify(message)};`,
});

async function installAcme(root: string): Promise<void> {
    await writeAcmeConfig(root);
    await installPackage(root, "bpmnlint-plugin-acme", ACME_MANIFEST, acmeFilesOf(root));
    await writeAcmeDependency(root, "v1");
}

/** Any other length than the text before, so the file's size changes too. */
export async function writeAcmeDependency(root: string, message: string): Promise<void> {
    await installPackage(root, "acme-dep", {}, acmeDependencyOf(message));
}

/** The dependency text of every rule run so far, oldest first. */
export async function acmeRuns(root: string): Promise<string[]> {
    const log = await fs.readFile(join(root, RAN_LOG), "utf8").catch(() => "");
    return log.split("\n").filter((line) => line !== "");
}

/** Opens `order.bpmn` in a fresh bridge over `root`, which `dispose` removes unless `keepRoot`. */
export async function openAcmeBridge(
    root: string,
    { keepRoot = false, pluginCacheRoot }: { keepRoot?: boolean; pluginCacheRoot?: string } = {},
): Promise<AcmeBridge> {
    const sourcePath = join(root, "order.bpmn");
    await fs.writeFile(sourcePath, BPMN_WITH_TASK);
    const frames: Frame[] = [];
    const bridge = createBridge(
        (line) => frames.push(JSON.parse(line)),
        () => {},
        pluginCacheRoot ? { pluginCacheRoot } : {},
    );
    const editorId = `file://${sourcePath}`;
    await bridge.rpc.handleLine(
        hostNotification(
            "session/register",
            registerParams(editorId, root, sourcePath, BPMN_WITH_TASK, { sessionId: 1 }),
        ),
    );
    return {
        rpc: bridge.rpc,
        frames,
        root,
        editorId,
        acmeDir: join(root, "node_modules", "bpmnlint-plugin-acme"),
        dispose: async () => {
            bridge.dispose();
            if (!keepRoot) {
                // The bridge does not wait for a lint in flight, whose rule may still append its log.
                await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
            }
        },
    };
}

/**
 * Asks for the config as the page does and reports the plugin rules it cannot
 * run in-page, so the bridge lints on the host.
 * @returns the host lint's results frame.
 */
export async function lintOnHost({ rpc, frames, editorId }: AcmeBridge): Promise<Frame> {
    const fromIndex = frames.length;
    await rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: { type: "GetBpmnlintConfigCommand" },
        }),
    );
    const instruction = await waitForFrame(frames, isConfigInstruction, { fromIndex });
    const resultsFrom = frames.length;
    await rpc.handleLine(
        hostNotification("webview/message", {
            editorId,
            sessionId: 1,
            message: {
                type: "UpdateLintResultsCommand",
                results: {},
                unresolved: ["plugin:acme/recommended"],
                configToken: postedMessageOf(instruction)?.configToken,
            },
        }),
    );
    return waitForFrame(frames, isLintResults, { fromIndex: resultsFrom });
}

/** An external edit of the diagram, which lints a host-linted editor again. */
export async function relint({ rpc, frames, editorId }: AcmeBridge): Promise<Frame> {
    const fromIndex = frames.length;
    await rpc.handleLine(
        hostNotification("document/didChange", { editorId, content: BPMN_WITH_TASK }),
    );
    return waitForFrame(frames, isLintResults, { fromIndex });
}

/** Waits for the host lint that follows a frame index, e.g. the one an allow starts. */
export function nextLintResults({ frames }: AcmeBridge, fromIndex: number): Promise<Frame> {
    return waitForFrame(frames, isLintResults, { fromIndex });
}

/** The findings of a host lint's results frame, by rule. */
export function findingsOf(results: Frame): Readonly<Record<string, readonly unknown[]>> {
    return postedMessageOf(results)?.results ?? {};
}

export function waitForNotice({ frames }: AcmeBridge, fromIndex = 0): Promise<Frame> {
    return waitForFrame(frames, isRequest("actionNotice/show"), { fromIndex });
}

/**
 * Answers an open notice with "Review…", reports the add-ons view as not shown,
 * so the list appears, checks every listed item and answers the change with
 * the list it merged into `stored` at the next revision, as the IntelliJ host
 * does. Throws on a change that allows anything but allowances.
 * @returns the change the bridge sent and what the host now stores.
 */
export async function reviewAndAllowAll(
    { rpc, frames }: AcmeBridge,
    notice: Frame,
    stored: PluginApprovalsSnapshot = { approvals: [], revision: 1 },
): Promise<{
    readonly change: PluginApprovalsChangeParams;
    readonly stored: PluginApprovalsSnapshot;
}> {
    const fromIndex = frames.length;
    await rpc.handleLine(hostReply(notice.id!, { chosen: 0 }));
    const reveal = await waitForFrame(frames, isRequest("addOns/reveal"), { fromIndex });
    await rpc.handleLine(hostReply(reveal.id!, { shown: false }));
    const list: Frame = await waitForFrame(frames, isRequest("picker/show"), { fromIndex });
    const items = list.params.items as readonly unknown[];
    await rpc.handleLine(hostReply(list.id!, { selected: items.map((_, index) => index) }));
    const request = await waitForFrame(frames, isRequest("pluginApprovals/change"), { fromIndex });
    const change = request.params as unknown as PluginApprovalsChangeParams;
    const notAllowance = change.allow.find(
        ({ contentHash }) => !contentHash.startsWith("allowance-v1:"),
    );
    if (notAllowance !== undefined) {
        throw new Error(`Expected only allowances, got ${JSON.stringify(notAllowance)}`);
    }
    const merged: PluginApprovalsSnapshot = {
        approvals: approvalsAfter(stored.approvals, change),
        revision: stored.revision + 1,
    };
    await rpc.handleLine(hostReply(request.id!, merged));
    return { change, stored: merged };
}

function installPackage(
    root: string,
    name: string,
    manifest: Record<string, unknown>,
    files: Record<string, string>,
): Promise<void> {
    return installPackageAt(join(root, "node_modules", name), name, manifest, files);
}

async function installPackageAt(
    dir: string,
    name: string,
    manifest: Record<string, unknown>,
    files: Record<string, string>,
): Promise<void> {
    for (const [relPath, content] of Object.entries({
        "package.json": JSON.stringify({ name, version: "1.0.0", ...manifest }),
        ...files,
    })) {
        await fs.mkdir(join(dir, relPath, ".."), { recursive: true });
        await fs.writeFile(join(dir, relPath), content);
    }
}
