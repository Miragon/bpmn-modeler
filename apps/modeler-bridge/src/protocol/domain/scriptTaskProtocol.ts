import { ProtocolEntry } from "./protocolEntry";
import {
    EmptyParams,
    ScriptCloseNotifyParams,
    ScriptCloseParams,
    ScriptDidChangeParams,
    ScriptDidOpenExternalParams,
    ScriptOpenParams,
    ScriptUpdateContentParams,
    ScriptUpdateVariablesParams,
} from "./types";

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
