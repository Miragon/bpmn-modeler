import {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
    MarketplaceRegistrations,
    MarketplaceScope,
    MarketplaceSettingsEntry,
    RawModelerSettings,
} from "@miragon/bpmn-modeler-core";

import { EmptyParams, ProtocolEntry } from "./protocolEntry";

/**
 * `marketplace/add`, `marketplace/update` and `marketplace/remove` — the
 * Tools-menu actions. The core runs each flow and asks the host for what it
 * needs. `settings` piggybacks the host's fresh snapshot so a flow never
 * depends on a prior `session/register` seed (an action may fire before any
 * editor is open).
 */
export interface MarketplaceCommandParams {
    settings: RawModelerSettings;
}

/**
 * `marketplaceState/read` — each scope's own list, the scopes the host can
 * write and where it saves each, as facts the core words. No `selfHostedIn`:
 * IntelliJ's lists hold URL strings, which cannot name a self-hosted host.
 */
export type MarketplaceStateReadResult = Omit<MarketplaceRegistrations, "selfHostedIn">;

/**
 * `marketplaceState/save` and `marketplaceState/remove` — acknowledged writes:
 * the host writes its store and pushes the fresh settings snapshot to every
 * affected bridge before it acks an empty reply, so the core's next settings
 * read sees the change.
 */
export interface MarketplaceStateSaveParams {
    location: string;
    scope: MarketplaceScope;
}
export interface MarketplaceStateRemoveParams {
    entries: MarketplaceSettingsEntry[];
}

/**
 * `marketplacePrompt/show` — the add question the core builds, without the
 * check it can only run in-process. Result is the answer as entered, or `null`
 * on cancel; the core checks the location and asks again.
 */
export type MarketplacePromptShowParams = Omit<MarketplaceAddPrompt, "problemWith">;
export type MarketplacePromptShowResult = MarketplaceAddAnswer;

/** `tokenStore/get` — read a per-host PAT; result carries the token, or `null` when none. */
export interface TokenStoreGetParams {
    host: string;
}
export interface TokenStoreGetResult {
    token: string;
}

/** `tokenStore/set` — persist a per-host PAT (an overwrite expresses token rotation). */
export interface TokenStoreSetParams {
    host: string;
    token: string;
}

/**
 * `tokenPrompt/show` — a modal password dialog with the core's title and prompt.
 * Result carries the answer as typed, or `null` on cancel; the core judges a
 * blank answer.
 */
export interface TokenPromptShowParams {
    title: string;
    prompt: string;
}
export interface TokenPromptShowResult {
    token: string;
}

export const TEMPLATE_MARKETPLACE_METHODS = {
    marketplaceAdd: "marketplace/add",
    marketplaceUpdate: "marketplace/update",
    marketplaceRemove: "marketplace/remove",
    marketplaceStateRead: "marketplaceState/read",
    marketplaceStateSave: "marketplaceState/save",
    marketplaceStateRemove: "marketplaceState/remove",
    marketplacePromptShow: "marketplacePrompt/show",
    tokenStoreGet: "tokenStore/get",
    tokenStoreSet: "tokenStore/set",
    tokenPromptShow: "tokenPrompt/show",
} as const;

export const TEMPLATE_MARKETPLACE_HOST_TO_CORE_NOTIFICATIONS = [
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceAdd,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies MarketplaceCommandParams,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceUpdate,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies MarketplaceCommandParams,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceRemove,
        direction: "hostToCore",
        kind: "notification",
        paramsFixture: { settings: {} } satisfies MarketplaceCommandParams,
    },
] as const satisfies readonly ProtocolEntry[];

export const TEMPLATE_MARKETPLACE_CORE_TO_HOST_REQUESTS = [
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceStateRead,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {} satisfies EmptyParams,
        resultFixture: {
            registered: { project: [], allProjects: ["https://github.com/owner/repo"] },
            writable: [
                { scope: "project", savedIn: { kind: "file", path: [".idea", "workspace.xml"] } },
                {
                    scope: "allProjects",
                    savedIn: {
                        kind: "settingsPage",
                        path: [
                            "Settings",
                            "Tools",
                            "Miragon BPMN Modeler",
                            "Template Marketplaces",
                        ],
                    },
                },
            ],
        } satisfies MarketplaceStateReadResult,
    },
    // Acknowledged writes: the host writes its store, pushes the fresh snapshot
    // to every affected bridge, then acks an empty reply, so the prune that
    // follows reads the list as the host now holds it.
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceStateSave,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            location: "https://github.com/owner/repo",
            scope: "project",
        } satisfies MarketplaceStateSaveParams,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplaceStateRemove,
        direction: "coreToHost",
        kind: "request",
        replyWait: "syncedWrite",
        paramsFixture: {
            entries: ["https://github.com/owner/repo"],
        } satisfies MarketplaceStateRemoveParams,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.marketplacePromptShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Add Template Marketplace",
            prompt: "GitHub or GitLab repository, or a local folder, holding a marketplace.json",
            placeholder: "https://github.com/owner/repo  or  ~/path/to/folder",
            location: "acme",
            invalidLocation: "Enter a GitHub or GitLab repository URL.",
            scopes: [
                {
                    scope: "project",
                    label: "Register for this project",
                    description: "Saved in .idea/workspace.xml",
                },
                {
                    scope: "allProjects",
                    label: "Register for all my projects",
                    description:
                        "Saved in Settings ▸ Tools ▸ Miragon BPMN Modeler ▸ Template Marketplaces",
                },
            ],
            scope: "project",
        } satisfies MarketplacePromptShowParams,
        resultFixture: {
            location: "https://github.com/owner/repo",
            scope: "allProjects",
        } satisfies MarketplacePromptShowResult,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.tokenStoreGet,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: { host: "github.com" } satisfies TokenStoreGetParams,
        resultFixture: { token: "ghp_example" } satisfies TokenStoreGetResult,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.tokenStoreSet,
        direction: "coreToHost",
        kind: "request",
        replyWait: "hostWork",
        paramsFixture: {
            host: "github.com",
            token: "ghp_example",
        } satisfies TokenStoreSetParams,
    },
    {
        method: TEMPLATE_MARKETPLACE_METHODS.tokenPromptShow,
        direction: "coreToHost",
        kind: "request",
        replyWait: "prompt",
        paramsFixture: {
            title: "Personal Access Token for github.com",
            prompt: "github.com denied access; enter a personal access token.",
        } satisfies TokenPromptShowParams,
        resultFixture: { token: "ghp_example" } satisfies TokenPromptShowResult,
    },
] as const satisfies readonly ProtocolEntry[];
