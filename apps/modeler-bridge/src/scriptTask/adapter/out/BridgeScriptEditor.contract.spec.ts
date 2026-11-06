import { describeScriptEditorContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../composition/bindHandlers";
import { METHODS } from "../../../protocol/domain/descriptor";
import { ScriptCloseParams, ScriptOpenParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { scriptHandlers } from "../in/scriptHandlers";
import { BridgeScriptEditor } from "./BridgeScriptEditor";

interface Frame {
    readonly method?: string;
    readonly params?: unknown;
}

/**
 * IntelliJ's script tabs as `ScriptRouter` and `ScriptEditorManager` answer
 * the bridge: `script/open` opens a tab per `scriptId`, or reveals the one
 * open; `script/close` closes it and acks with `script/didClose` from a later
 * EDT turn, also for a tab it never opened; a tab the user closes reports
 * `script/didClose` at once.
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

    async closeByUser(filePath: string): Promise<void> {
        const scriptId = [...this.filePathByScript].find(([, path]) => path === filePath)?.[0];
        if (scriptId === undefined) {
            throw new Error(`No tab shows ${filePath}`);
        }
        this.filePathByScript.delete(scriptId);
        await this.sendToBridge(didClose(scriptId));
    }
}

function didClose(scriptId: string): Frame {
    return { method: METHODS.scriptDidClose, params: { scriptId } satisfies ScriptCloseParams };
}

describeScriptEditorContract(
    "BridgeScriptEditor over RPC to IntelliJ's tabs",
    async ({ store, picker, notifier, settings, scriptFiles, variables }) => {
        const intellij = new IntelliJScriptTabs((frame) => rpc.handleLine(JSON.stringify(frame)));
        const rpc = new Rpc((line) => intellij.receive(JSON.parse(line) as Frame));
        const editor = new BridgeScriptEditor(
            store,
            picker,
            rpc,
            notifier,
            settings,
            scriptFiles,
            variables,
        );
        bindHandlers(rpc, scriptHandlers({ scriptTabs: editor, store, notifier }));
        return {
            scriptEditor: editor,
            closeTab: (filePath) => intellij.closeByUser(filePath),
        };
    },
);
