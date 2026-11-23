import { RawModelerSettings } from "@miragon/bpmn-modeler-core";
import { Command, Query } from "@miragon/bpmn-modeler-shared";

import { EmptyParams, ProtocolEntry } from "./protocolEntry";
import { SAMPLE_COMMAND, SAMPLE_QUERY } from "./sharedSamples";

/** `addOns/webviewMessage` — a {@link Command} from the add-ons view's page. */
export interface AddOnsWebviewMessageParams {
    message: Command;
}

/**
 * `addOns/open` — the host shows or hides its add-ons view. `workspaceRoot` is
 * the project root the view lists, held for the life of the process; absent
 * when the project has none. `settings` is applied first, so the first listing
 * already reads the configured folder.
 */
export interface AddOnsOpenParams {
    open: boolean;
    workspaceRoot?: string;
    settings: RawModelerSettings;
}

/** `addOns/reveal` — whether the host now shows its add-ons view. */
export interface AddOnsRevealResult {
    shown: boolean;
}

/** `addOns/postMessage` — the core pushes a {@link Query} into the add-ons view's page. */
interface AddOnsPostMessageParams {
    message: Query;
}

export const ADD_ONS_METHODS = {
    addOnsWebviewMessage: "addOns/webviewMessage",
    addOnsOpen: "addOns/open",
    addOnsRefresh: "addOns/refresh",
    addOnsReview: "addOns/review",
    addOnsReveal: "addOns/reveal",
    addOnsPostMessage: "addOns/postMessage",
} as const;

export const ADD_ONS_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: ADD_ONS_METHODS.addOnsWebviewMessage,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { message: SAMPLE_COMMAND } satisfies AddOnsWebviewMessageParams,
    },
    {
        method: ADD_ONS_METHODS.addOnsOpen,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {
            open: true,
            workspaceRoot: "/repo",
            settings: { configFolder: ".camunda" },
        } satisfies AddOnsOpenParams,
    },
    {
        method: ADD_ONS_METHODS.addOnsRefresh,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
    {
        method: ADD_ONS_METHODS.addOnsReview,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: {} satisfies EmptyParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const ADD_ONS_CORE_TO_HOST_REQUESTS = [
    // Without the rows: the core delivers them to the view it attached, once shown.
    {
        method: ADD_ONS_METHODS.addOnsReveal,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostShow",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: { shown: true } satisfies AddOnsRevealResult,
    },
] as const satisfies readonly ProtocolEntry[];

export const ADD_ONS_CORE_TO_HOST_NOTIFICATIONS = [
    {
        method: ADD_ONS_METHODS.addOnsPostMessage,
        direction: "coreToHost",
        kind: "notification",
        paramsFixture: { message: SAMPLE_QUERY } satisfies AddOnsPostMessageParams,
    },
] as const satisfies readonly ProtocolEntry[];
