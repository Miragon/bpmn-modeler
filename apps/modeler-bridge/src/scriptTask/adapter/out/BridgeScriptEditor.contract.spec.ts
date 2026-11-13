import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describeScriptEditorContract } from "@miragon/bpmn-modeler-core/testing";
import { describe, expect, it } from "vitest";

import { bindHandlers } from "../../../composition/bindHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    ScriptCloseParams,
    ScriptDidOpenExternalParams,
    ScriptOpenParams,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { scriptHandlers } from "../in/scriptHandlers";
import { BridgeScriptEditor } from "./BridgeScriptEditor";

interface Frame {
    readonly method?: string;
    readonly params?: unknown;
}

interface ScriptTabsCase {
    readonly name: string;
    readonly steps: readonly { by: "core" | "user"; method: string; scriptId: string }[];
    readonly sentToBridge: readonly Frame[];
    readonly openTabs: readonly string[];
}

const SCRIPT_TABS_CASES = (
    JSON.parse(
        readFileSync(resolve(__dirname, "../../../__fixtures__/intellijScriptTabs.cases.json"), "utf8"),
    ) as { cases: ScriptTabsCase[] }
).cases;

/**
 * IntelliJ's script tabs as `ScriptRouter` and `ScriptEditorManager` answer
 * the bridge: `script/open` opens a tab per `scriptId`, or reveals the one
 * open; `script/close` closes it and acks with `script/didClose` from a later
 * EDT turn, also for a tab it never opened; a tab the user closes reports
 * `script/didClose` at once; a file under a `tmp/scripting` folder the user
 * opens, and no tab shows yet, reports `script/didOpenExternal`.
 * `ScriptRouterTest` runs `intellijScriptTabs.cases.json`, which these tabs
 * answer too.
 */
class IntelliJScriptTabs {
    private readonly filePathByScript = new Map<string, string | undefined>();

    constructor(private readonly sendToBridge: (frame: Frame) => Promise<void>) {}

    receive(frame: Frame): void {
        if (frame.method === METHODS.scriptOpen) {
            const { scriptId, filePath } = frame.params as ScriptOpenParams;
            if (!this.filePathByScript.has(scriptId)) this.filePathByScript.set(scriptId, filePath);
        } else if (frame.method === METHODS.scriptClose) {
            const { scriptId } = frame.params as ScriptCloseParams;
            this.filePathByScript.delete(scriptId);
            setTimeout(() => void this.sendToBridge(didClose(scriptId)), 0);
        }
    }

    async openByUser(filePath: string): Promise<void> {
        if (!filePath.includes("/tmp/scripting/") || this.shows(filePath)) return;
        await this.sendToBridge({
            method: METHODS.scriptDidOpenExternal,
            params: { filePath } satisfies ScriptDidOpenExternalParams,
        });
    }

    async closeByUser(filePath: string): Promise<void> {
        const scriptId = [...this.filePathByScript].find(([, path]) => path === filePath)?.[0];
        if (scriptId === undefined) {
            throw new Error(`No tab shows ${filePath}`);
        }
        this.filePathByScript.delete(scriptId);
        await this.sendToBridge(didClose(scriptId));
    }

    openScripts(): readonly string[] {
        return [...this.filePathByScript.keys()];
    }

    private shows(filePath: string): boolean {
        return [...this.filePathByScript.values()].includes(filePath);
    }
}

function didClose(scriptId: string): Frame {
    return { method: METHODS.scriptDidClose, params: { scriptId } satisfies ScriptCloseParams };
}

describeScriptEditorContract(
    "BridgeScriptEditor over RPC to IntelliJ's tabs",
    async ({ store, targets, notifier, settings, scriptFiles, variables }) => {
        const intellij = new IntelliJScriptTabs((frame) => rpc.handleLine(JSON.stringify(frame)));
        const rpc = new Rpc((line) => intellij.receive(JSON.parse(line) as Frame));
        const editor = new BridgeScriptEditor(
            store,
            targets,
            rpc,
            notifier,
            settings,
            scriptFiles,
            variables,
        );
        bindHandlers(rpc, scriptHandlers({ scriptTabs: editor, store, notifier }));
        return {
            scriptEditor: editor,
            openFileByUser: (filePath) => intellij.openByUser(filePath),
            closeTab: (filePath) => intellij.closeByUser(filePath),
        };
    },
);

describe("the loopback tabs answer the rows ScriptRouterTest runs", () => {
    const scriptPath = (scriptId: string) => `/ws/.camunda/tmp/scripting/h/${scriptId}.js`;

    it.each(SCRIPT_TABS_CASES)("$name", async ({ steps, sentToBridge, openTabs }) => {
        const sent: Frame[] = [];
        const intellij = new IntelliJScriptTabs(async (frame) => {
            sent.push(frame);
        });

        for (const { by, method, scriptId } of steps) {
            if (by === "user") {
                await intellij.closeByUser(scriptPath(scriptId));
            } else {
                intellij.receive({
                    method,
                    params: { scriptId, fileName: `${scriptId}.js`, filePath: scriptPath(scriptId), content: "" },
                });
            }
        }
        await new Promise((settle) => setTimeout(settle, 0));

        expect(sent).toEqual(sentToBridge);
        expect(intellij.openScripts()).toEqual(openTabs);
    });
});
