import { GlobalFunctionDef, MethodDef } from "@miragon/bpmn-modeler-core";
import { VariableDef } from "@miragon/bpmn-modeler-types";

import { EmptyParams, ProtocolEntry } from "./protocolEntry";

/** `script/didChange` — the host reports an edit in an open script tab. */
export interface ScriptDidChangeParams {
    scriptId: string;
    content: string;
}

/**
 * `script/didClose` — the host reports a script tab is closed: user-initiated,
 * or the completion ack of a core-initiated `script/close`. Sent only after
 * the host flush-saved the closing document, so the core may delete the
 * on-disk file on receipt without racing that save.
 */
export interface ScriptCloseParams {
    scriptId: string;
}

/**
 * `script/didOpenExternal` — the host reports a script file was opened outside
 * the core's own `script/open` flow (Project view, Explorer, Quick Open, or the
 * panel button on an untracked file). The core adopts it into live sync; a
 * system-independent path lets `parseScriptPath` match regardless of separator.
 */
export interface ScriptDidOpenExternalParams {
    filePath: string;
}

/** Completion bean shipped to the host so it never needs BPMN/PSI knowledge. */
interface ScriptCompletionBean {
    name: string;
    type: string;
    description: string;
    methods: readonly unknown[];
}

/** `script/open` — open (or reveal) an inline script in a host text editor. */
export interface ScriptOpenParams {
    scriptId: string;
    fileName: string;
    languageId: string;
    /**
     * Absolute path of the real script file the bridge wrote into the editor's
     * script folder. The host opens this file (re-enabling IdeaVim and
     * file-based tooling). The field is absent when the folder lookup or the
     * write failed; the host then opens an in-memory `LightVirtualFile` from
     * `content`, as it does when the path fails to resolve.
     */
    filePath?: string;
    content: string;
    completion: {
        beans: readonly ScriptCompletionBean[];
        variables: VariableDef[];
        /** Camunda SPIN globals (`S`/`JSON`) offered at script root; empty when the SPIN setting is off. */
        globals: readonly GlobalFunctionDef[];
        /**
         * Type name → callable methods, for resolving a typed variable's members
         * (e.g. a `typeHint: "SpinJsonNode"` variable's `node.` completion).
         * Empty when the SPIN setting is off.
         */
        types: Record<string, readonly MethodDef[]>;
    };
}

/** `script/updateVariables` — refresh one tab's process-variable completion. */
interface ScriptUpdateVariablesParams {
    scriptId: string;
    variables: VariableDef[];
}

/**
 * `script/updateContent` — the core overwrites an open tab's content because
 * the script changed on the *model* side (canvas undo/redo, document reload).
 * The host must guard its document listener so the write doesn't echo back as
 * a `script/didChange`.
 */
interface ScriptUpdateContentParams {
    scriptId: string;
    content: string;
}

/**
 * `script/close` — the core tells the host to close a script tab it opened.
 * The host flushes and closes the tab, then acks with `script/didClose`; the
 * core defers deleting the script's on-disk file until that ack.
 */
interface ScriptCloseNotifyParams {
    scriptId: string;
}

export const SCRIPT_TASK_METHODS = {
    scriptDidChange: "script/didChange",
    scriptDidClose: "script/didClose",
    scriptOpenAll: "script/openAll",
    scriptDidOpenExternal: "script/didOpenExternal",
    scriptOpen: "script/open",
    scriptUpdateVariables: "script/updateVariables",
    scriptUpdateContent: "script/updateContent",
    scriptClose: "script/close",
} as const;

export const SCRIPT_TASK_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: SCRIPT_TASK_METHODS.scriptDidChange,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { scriptId: "s1", content: "x" } satisfies ScriptDidChangeParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptDidClose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { scriptId: "s1" } satisfies ScriptCloseParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptOpenAll,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptDidOpenExternal,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            filePath: "/ws/.camunda/tmp/scripting/h/e/script-task/e.js",
        } satisfies ScriptDidOpenExternalParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const SCRIPT_TASK_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: SCRIPT_TASK_METHODS.scriptOpen,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            scriptId: "s1",
            fileName: "script.js",
            languageId: "javascript",
            filePath: "/ws/.camunda/tmp/scripting/h/e/script-task/script.js",
            content: "x",
            completion: { beans: [], variables: [], globals: [], types: {} },
        } satisfies ScriptOpenParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptUpdateVariables,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1", variables: [] } satisfies ScriptUpdateVariablesParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptUpdateContent,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1", content: "x" } satisfies ScriptUpdateContentParams,
    },
    {
        method: SCRIPT_TASK_METHODS.scriptClose,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { scriptId: "s1" } satisfies ScriptCloseNotifyParams,
    },
] as const satisfies readonly ProtocolEntry[];
