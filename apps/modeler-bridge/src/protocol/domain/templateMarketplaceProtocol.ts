import { ProtocolEntry } from "./protocolEntry";
import {
    EmptyParams,
    MarketplaceCommandParams,
    MarketplacePromptShowParams,
    MarketplacePromptShowResult,
    MarketplaceStateReadResult,
    MarketplaceStateRemoveParams,
    MarketplaceStateSaveParams,
    TokenPromptShowParams,
    TokenPromptShowResult,
    TokenStoreGetParams,
    TokenStoreGetResult,
    TokenStoreSetParams,
} from "./types";

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
