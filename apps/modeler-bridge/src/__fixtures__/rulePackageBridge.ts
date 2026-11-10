/**
 * A bridge over a temp workspace whose `.bpmnlintrc` extends
 * `plugin:acme/recommended`, with the host's side played through the recorded
 * frames. `bpmnlint-plugin-acme` reports every task with the text its one
 * dependency, `acme-dep`, exports, and appends that text to a log next to the
 * diagram, so a caller sees which bytes ran. Free of Vitest, so the Bun smoke
 * script drives the same workspace.
 */

import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { approvalsAfter } from "@miragon/bpmn-modeler-core";

import { createBridge } from "../composition/bridge";
import { PluginApprovalsChangeParams, PluginApprovalsSnapshot } from "../protocol/domain/types";
import { Rpc } from "../transport/adapter/out/Rpc";
import { hostNotification, hostReply, registerParams, waitForFrame } from "./bridgeHarness";

export const ACME_RULE = "acme/task-found";

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

export async function createAcmeWorkspace(): Promise<string> {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "bridge-rule-packages-")));
    await fs.writeFile(
        join(root, ".bpmnlintrc"),
        JSON.stringify({ extends: "plugin:acme/recommended" }),
    );
    await installPackage(
        root,
        "bpmnlint-plugin-acme",
        { dependencies: { "acme-dep": "1.0.0" } },
        {
            "index.js": `module.exports = { configs: { recommended: { rules: { ${JSON.stringify(ACME_RULE)}: "warn" } } } };`,
            "rules/task-found.js": `const message = require("acme-dep");
module.exports = () => ({
    check(node, reporter) {
        if (node.$type !== "bpmn:Task") return;
        require("fs").appendFileSync(${JSON.stringify(join(root, RAN_LOG))}, message + "\\n");
        reporter.report(node.id, message);
    },
});`,
        },
    );
    await writeAcmeDependency(root, "v1");
    return root;
}

/** Any other length than the text before, so the file's size changes too. */
export async function writeAcmeDependency(root: string, message: string): Promise<void> {
    await installPackage(
        root,
        "acme-dep",
        {},
        {
            "index.js": `module.exports = ${JSON.stringify(message)};`,
        },
    );
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
 * does.
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
    const merged: PluginApprovalsSnapshot = {
        approvals: approvalsAfter(stored.approvals, change),
        revision: stored.revision + 1,
    };
    await rpc.handleLine(hostReply(request.id!, merged));
    return { change, stored: merged };
}

async function installPackage(
    root: string,
    name: string,
    manifest: Record<string, unknown>,
    files: Record<string, string>,
): Promise<void> {
    const dir = join(root, "node_modules", name);
    for (const [relPath, content] of Object.entries({
        "package.json": JSON.stringify({ name, version: "1.0.0", ...manifest }),
        ...files,
    })) {
        await fs.mkdir(join(dir, relPath, ".."), { recursive: true });
        await fs.writeFile(join(dir, relPath), content);
    }
}
