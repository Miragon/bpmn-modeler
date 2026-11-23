import { Command } from "@miragon/bpmn-modeler-shared";
import { DiffOrigin } from "@miragon/bpmn-modeler-types";

import { ProtocolEntry } from "./protocolEntry";
import { SAMPLE_COMMAND } from "./sharedSamples";

/** One side of a diff: a diff-scoped pane uri plus its cached XML. */
interface DiffPaneInput {
    /** Stable, diff-scoped pane identity (host appends `#<diffId>-<role>`). */
    uri: string;
    content: string;
}

/** `diff/open` — the host opens a two-pane diff with both sides known up front. */
export interface DiffOpenParams {
    diffId: string;
    /** IntelliJ opens no merge view, so its diffs are never merge panes. */
    origin: Exclude<DiffOrigin, "merge" | "merge-result">;
    before: DiffPaneInput;
    after: DiffPaneInput;
}

/** `diff/webviewMessage` — a webview {@link Command} from one diff pane. */
export interface DiffWebviewMessageParams {
    paneUri: string;
    message: Command;
}

/** `diff/dispose` — tear down both panes of a diff. */
export interface DiffDisposeParams {
    diffId: string;
}

/** `elementXmlDiff/closed` — the user closed the element XML diff `diffKey`. */
export interface ElementXmlDiffClosedParams {
    diffKey: string;
}

/** `diff/postMessage` — the core drives one diff pane's host browser. */
export interface DiffPostMessageParams {
    paneUri: string;
    message: unknown;
}

/**
 * `elementXmlDiff/show` opens or replaces the element XML diff `diffKey` inside
 * the diagram diff of pane `paneUri`; `elementXmlDiff/refresh` only replaces it.
 */
export interface ElementXmlDiffShowParams {
    diffKey: string;
    paneUri: string;
    title: string;
    before: string;
    after: string;
}

/** `elementXmlDiff/close` — the diagram diff of the element XML diff `diffKey` closed. */
export interface ElementXmlDiffCloseParams {
    diffKey: string;
}

export const DIFF_METHODS = {
    diffOpen: "diff/open",
    diffWebviewMessage: "diff/webviewMessage",
    diffDispose: "diff/dispose",
    diffPostMessage: "diff/postMessage",
    elementXmlDiffShow: "elementXmlDiff/show",
    elementXmlDiffRefresh: "elementXmlDiff/refresh",
    elementXmlDiffClose: "elementXmlDiff/close",
    elementXmlDiffClosed: "elementXmlDiff/closed",
} as const;

const ELEMENT_XML_DIFF_FIXTURE = {
    diffKey: "element-xml-1",
    paneUri: "u#d1-before",
    title: "Task_1 (XML): order.bpmn",
    before: '<bpmn:task id="Task_1" name="old" />',
    after: '<bpmn:task id="Task_1" name="new" />',
} satisfies ElementXmlDiffShowParams;

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
    {
        method: DIFF_METHODS.elementXmlDiffClosed,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { diffKey: "element-xml-1" } satisfies ElementXmlDiffClosedParams,
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
    {
        method: DIFF_METHODS.elementXmlDiffShow,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: ELEMENT_XML_DIFF_FIXTURE,
    },
    {
        method: DIFF_METHODS.elementXmlDiffRefresh,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: ELEMENT_XML_DIFF_FIXTURE,
    },
    {
        method: DIFF_METHODS.elementXmlDiffClose,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { diffKey: "element-xml-1" } satisfies ElementXmlDiffCloseParams,
    },
] as const satisfies readonly ProtocolEntry[];
