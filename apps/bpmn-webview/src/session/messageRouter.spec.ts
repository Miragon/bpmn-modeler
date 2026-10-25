import { describe, expect, it, vi } from "vitest";

import {
    BpmnModelerSettingQuery,
    type Command,
    ElementTemplatesQuery,
    FlushDocumentQuery,
    LanguageQuery,
    type Query,
    ReleaseDocumentFlushQuery,
    TakeFocusQuery,
} from "@miragon/bpmn-modeler-shared";

import {
    admitSessionMessage,
    createHostMessageRouter,
    createSessionMessageRouter,
    type DiffPaneHostMessages,
    type HostMessage,
    type HostMessageHandlers,
    type SessionHostMessages,
    type SessionMessageType,
} from "./messageRouter";

function createHost() {
    const sent: (Command | Query)[] = [];
    return {
        sent,
        postMessage: vi.fn((message: Command | Query) => {
            sent.push(message);
        }),
        loggedErrors: () =>
            sent
                .filter((message) => message.type === "LogErrorCommand")
                .map((message) => (message as unknown as { message: string }).message),
    };
}

function fakeSessionHandlers() {
    return {
        BpmnFileQuery: vi.fn(),
        ElementTemplatesQuery: vi.fn(),
        BpmnlintResultsQuery: vi.fn(),
        BpmnLintDisabledQuery: vi.fn(),
        BpmnlintInPageQuery: vi.fn(),
        BpmnModelerSettingQuery: vi.fn(),
        PropertiesPanelStateQuery: vi.fn(),
        ClipboardQuery: vi.fn(),
        TextClipboardQuery: vi.fn(),
        LanguageQuery: vi.fn(),
        GetDiagramAsSVGCommand: vi.fn(),
        OpenAllScriptTasksQuery: vi.fn(),
        FormatDiagramQuery: vi.fn(),
        CleanupDiagramQuery: vi.fn(),
        UpdateScriptContentQuery: vi.fn(),
        UpdateScriptFormatQuery: vi.fn(),
        UpdateOpenScriptEditorsQuery: vi.fn(),
        ImplementationStatusQuery: vi.fn(),
        FormReferenceStatusQuery: vi.fn(),
        WorkspaceDefinitionsQuery: vi.fn(),
        FocusElementQuery: vi.fn(),
        TakeFocusQuery: vi.fn(),
        FlushDocumentQuery: vi.fn(),
        ReleaseDocumentFlushQuery: vi.fn(),
    } satisfies HostMessageHandlers<SessionHostMessages>;
}

const sessionMessageTypes = Object.keys(fakeSessionHandlers()) as SessionMessageType[];

const importBoundTypes: SessionMessageType[] = [
    "ElementTemplatesQuery",
    "BpmnModelerSettingQuery",
    "BpmnlintResultsQuery",
    "BpmnLintDisabledQuery",
    "BpmnlintInPageQuery",
    "LanguageQuery",
    "UpdateScriptContentQuery",
    "UpdateScriptFormatQuery",
    "UpdateOpenScriptEditorsQuery",
    "ImplementationStatusQuery",
];

const flushHandshakeTypes: SessionMessageType[] = [
    "FlushDocumentQuery",
    "ReleaseDocumentFlushQuery",
];

const settingsQuery = () =>
    new BpmnModelerSettingQuery({
        alignToOrigin: false,
        showTransactionBoundaries: false,
        colorTheme: "light",
    });

function sessionRouter(engineReload = { isReloadingForEngine: false }) {
    const host = createHost();
    const handlers = fakeSessionHandlers();
    const router = createSessionMessageRouter(host, handlers, engineReload);
    return { host, handlers, router, engineReload };
}

describe("createHostMessageRouter", () => {
    it("hands a message to the handler registered for its type", async () => {
        const languageHandler = vi.fn();
        const takeFocusHandler = vi.fn();
        const route = createHostMessageRouter<{
            LanguageQuery: LanguageQuery;
            TakeFocusQuery: TakeFocusQuery;
        }>(createHost(), { LanguageQuery: languageHandler, TakeFocusQuery: takeFocusHandler });
        const query = new LanguageQuery("de");

        await route(query);

        expect(languageHandler).toHaveBeenCalledExactlyOnceWith(query);
        expect(takeFocusHandler).not.toHaveBeenCalled();
    });

    it.each(["ElementTemplatesQuery", "toString", "constructor", "__proto__", "hasOwnProperty"])(
        "ignores a %s it has no handler for",
        async (type) => {
            const host = createHost();
            const route = createHostMessageRouter<{ LanguageQuery: LanguageQuery }>(host, {
                LanguageQuery: vi.fn(),
            });

            await expect(route({ type } as HostMessage)).resolves.toBeUndefined();

            expect(host.sent).toEqual([]);
        },
    );

    it("settles once an async handler has finished", async () => {
        let finishHandler!: () => void;
        const finished = vi.fn();
        const route = createHostMessageRouter<{ LanguageQuery: LanguageQuery }>(createHost(), {
            LanguageQuery: () =>
                new Promise<void>((resolve) => {
                    finishHandler = resolve;
                }),
        });

        const routed = route(new LanguageQuery("de")).then(finished);
        await Promise.resolve();
        expect(finished).not.toHaveBeenCalled();

        finishHandler();
        await routed;
        expect(finished).toHaveBeenCalledOnce();
    });

    it.each([
        [
            "a throwing",
            () => {
                throw new Error("surface gone");
            },
            "surface gone",
        ],
        ["a rejecting", () => Promise.reject(new Error("export failed")), "export failed"],
        [
            "a message-bearing",
            () => Promise.reject({ message: "import warning" }),
            "import warning",
        ],
        ["a bare", () => Promise.reject("plain reason"), "plain reason"],
        ["an undefined", () => Promise.reject(undefined), "undefined"],
    ])("logs %s handler failure under the message type", async (_case, handler, detail) => {
        const host = createHost();
        const route = createHostMessageRouter<{ LanguageQuery: LanguageQuery }>(host, {
            LanguageQuery: handler,
        });

        await expect(route(new LanguageQuery("de"))).resolves.toBeUndefined();

        expect(host.loggedErrors()).toEqual([`Error receiving message: LanguageQuery — ${detail}`]);
    });
});

describe("diff pane router", () => {
    it("follows language changes and ignores every other session message", async () => {
        const host = createHost();
        const followLanguage = vi.fn();
        const route = createHostMessageRouter<DiffPaneHostMessages>(host, {
            LanguageQuery: followLanguage,
        });
        const languageChange = new LanguageQuery("de");

        for (const type of sessionMessageTypes.filter((type) => type !== "LanguageQuery")) {
            await route({ type } as HostMessage);
        }
        await route(languageChange);

        expect(followLanguage).toHaveBeenCalledExactlyOnceWith(languageChange);
        expect(host.sent).toEqual([]);
    });
});

describe("admitSessionMessage", () => {
    it.each(importBoundTypes)("holds %s for the initial import", (type) => {
        expect(admitSessionMessage(type, { engineReloading: false })).toBe("importBound");
    });

    it.each(sessionMessageTypes.filter((type) => !importBoundTypes.includes(type)))(
        "routes %s right away",
        (type) => {
            expect(admitSessionMessage(type, { engineReloading: false })).toBe("route");
        },
    );

    it.each(flushHandshakeTypes)("still routes %s while the engine reload is pending", (type) => {
        expect(admitSessionMessage(type, { engineReloading: true })).toBe("route");
    });

    it.each(sessionMessageTypes.filter((type) => !flushHandshakeTypes.includes(type)))(
        "drops %s while the engine reload is pending",
        (type) => {
            expect(admitSessionMessage(type, { engineReloading: true })).toBe("drop");
        },
    );
});

describe("createSessionMessageRouter", () => {
    it("hands every session message type to the handler named after it", async () => {
        const { handlers, router } = sessionRouter();
        router.openImportBound();

        for (const type of sessionMessageTypes) {
            await router.route({ type } as HostMessage);
        }

        for (const [type, handler] of Object.entries(handlers)) {
            expect(handler, type).toHaveBeenCalledExactlyOnceWith({ type });
        }
    });

    it("routes a message that does not act on the import right away", async () => {
        const { handlers, router } = sessionRouter();

        await router.route(new TakeFocusQuery());

        expect(handlers.TakeFocusQuery).toHaveBeenCalledOnce();
    });

    it("holds import-bound messages until the import completes, then replays them in order", async () => {
        const { handlers, router } = sessionRouter();
        const delivered: string[] = [];
        handlers.ElementTemplatesQuery.mockImplementation(() => delivered.push("templates"));
        handlers.BpmnModelerSettingQuery.mockImplementation(() => delivered.push("settings"));
        handlers.LanguageQuery.mockImplementation(() => delivered.push("language"));

        await router.route(new ElementTemplatesQuery([]));
        await router.route(settingsQuery());
        expect(delivered).toEqual([]);

        router.openImportBound();
        await router.route(new LanguageQuery("de"));

        expect(delivered).toEqual(["templates", "settings", "language"]);
    });

    it("drops held messages when they are discarded and routes later ones directly", async () => {
        const { handlers, router } = sessionRouter();

        await router.route(new LanguageQuery("de"));
        router.discardImportBound();
        await router.route(new LanguageQuery("fr"));

        expect(handlers.LanguageQuery).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ locale: "fr" }),
        );
    });

    it("answers only the flush handshake while the engine reload is pending", async () => {
        const { handlers, router } = sessionRouter({ isReloadingForEngine: true });
        const flush = new FlushDocumentQuery(7, true);
        const release = new ReleaseDocumentFlushQuery(7);

        await router.route(new TakeFocusQuery());
        await router.route(flush);
        await router.route(release);

        expect(handlers.TakeFocusQuery).not.toHaveBeenCalled();
        expect(handlers.FlushDocumentQuery).toHaveBeenCalledExactlyOnceWith(flush);
        expect(handlers.ReleaseDocumentFlushQuery).toHaveBeenCalledExactlyOnceWith(release);
    });

    it("drops a held message whose replay comes after the engine reload began", async () => {
        const { handlers, router, engineReload } = sessionRouter();

        await router.route(settingsQuery());
        engineReload.isReloadingForEngine = true;
        router.openImportBound();

        expect(handlers.BpmnModelerSettingQuery).not.toHaveBeenCalled();
    });

    it("logs a failing handler instead of rejecting", async () => {
        const { host, handlers, router } = sessionRouter();
        handlers.TakeFocusQuery.mockImplementation(() => {
            throw new TypeError("canvas is undefined");
        });

        await expect(router.route(new TakeFocusQuery())).resolves.toBeUndefined();

        expect(host.loggedErrors()).toEqual([
            "Error receiving message: TakeFocusQuery — canvas is undefined",
        ]);
    });
});
