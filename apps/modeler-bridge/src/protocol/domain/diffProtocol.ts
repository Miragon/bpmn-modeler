import { ProtocolEntry } from "./protocolEntry";
import { SAMPLE_COMMAND } from "./sharedSamples";
import {
    DiffDisposeParams,
    DiffOpenParams,
    DiffPostMessageParams,
    DiffWebviewMessageParams,
} from "./types";

export const DIFF_METHODS = {
    diffOpen: "diff/open",
    diffWebviewMessage: "diff/webviewMessage",
    diffDispose: "diff/dispose",
    diffPostMessage: "diff/postMessage",
} as const;

export const DIFF_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: DIFF_METHODS.diffOpen,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            diffId: "d1",
            origin: "scm",
            before: { uri: "u#d1-before", content: "<bpmn/>" },
            after: { uri: "u#d1-after", content: "<bpmn/>" },
        } satisfies DiffOpenParams,
    },
    {
        method: DIFF_METHODS.diffWebviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            paneUri: "u#d1-before",
            message: SAMPLE_COMMAND,
        } satisfies DiffWebviewMessageParams,
    },
    {
        method: DIFF_METHODS.diffDispose,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { diffId: "d1" } satisfies DiffDisposeParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const DIFF_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: DIFF_METHODS.diffPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: {
            paneUri: "u#d1-before",
            message: SAMPLE_COMMAND,
        } satisfies DiffPostMessageParams,
    },
] as const satisfies readonly ProtocolEntry[];
