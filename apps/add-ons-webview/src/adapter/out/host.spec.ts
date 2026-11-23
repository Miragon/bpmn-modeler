import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    type AddOnActionResultPayload,
    AddOnActionResultQuery,
    AddOnCatalogPayload,
    AddOnCatalogQuery,
    AddOnRequestCommand,
    type AddOnRequestPayload,
    AddOnsViewCommandType,
    BrandModeQuery,
    GetAddOnCatalogCommand,
    GetAddOnAboutCommand,
    HostApiImpl,
    LogErrorCommand,
    LogInfoCommand,
    MessageOfType,
    MockHostApi,
    OpenAddOnDetailCommand,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./host";

const COMMANDS: { [Type in AddOnsViewCommandType]: MessageOfType<Type> } = {
    LogInfoCommand: new LogInfoCommand("info"),
    LogErrorCommand: new LogErrorCommand("error"),
    GetAddOnCatalogCommand: new GetAddOnCatalogCommand(),
    AddOnRequestCommand: new AddOnRequestCommand(1, { kind: "refresh" }),
    OpenAddOnDetailCommand: new OpenAddOnDetailCommand("plugin:/work/x"),
    GetAddOnAboutCommand: new GetAddOnAboutCommand("plugin:/work/x"),
};

type Reply = AddOnCatalogQuery | AddOnActionResultQuery | RevealAddOnsQuery | BrandModeQuery;

const RESIZE_TASKS = "plugin:/work/.camunda/plugins/resize";
const GONE = "plugin:/gone";
const UNLISTED = { kind: "refused", reason: "unknownAddOn", message: "This add-on is no longer listed." } as const;

const reveals = (replies: readonly Reply[]) =>
    replies.flatMap((each) => (each instanceof RevealAddOnsQuery ? [each.reveal] : []));

function previewAt(search = "") {
    window.history.replaceState(null, "", `/${search}`);
    vi.stubEnv("NODE_ENV", "development");
    const replies: Reply[] = [];
    window.addEventListener("message", (event: MessageEvent<Reply>) => replies.push(event.data));
    const host = getHostApi();
    const models = () =>
        replies.flatMap((each) => (each instanceof AddOnCatalogQuery ? [each.model] : []));
    const results = () =>
        replies.flatMap((each) => (each instanceof AddOnActionResultQuery ? [each.result] : []));
    const rows = (model: AddOnCatalogPayload) =>
        model.groups.flatMap((group) => group.sources.flatMap((source) => source.addOns));
    const rowNamed = (name: string) => rows(models().at(-1)!).find((row) => row.name === name)!;

    return { host, replies, models, results, rowNamed };
}

describe("getHostApi", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("serves the in-browser mock only to the development preview", () => {
        vi.stubEnv("NODE_ENV", "development");

        expect(getHostApi()).toBeInstanceOf(MockHostApi);
    });

    it("talks to the embedding host in every other build", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: vi.fn(), getState: vi.fn(), setState: vi.fn() }));

        expect(getHostApi()).toBeInstanceOf(HostApiImpl);
    });
});

describe("the preview's host", () => {
    beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => undefined));
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        document.documentElement.removeAttribute("style");
    });

    it.each(Object.values(COMMANDS))("answers $type", (command) => {
        const { host } = previewAt();

        expect(() => host.postMessage(command)).not.toThrow();
    });

    it("throws on a command no surface list names, as the BPMN preview does", () => {
        const { host } = previewAt();

        expect(() => host.postMessage({ type: "DeployCommand" } as never)).toThrow("DeployCommand");
    });

    it("serves a catalog with every state a row can show", () => {
        const { host, models } = previewAt();

        host.postMessage(new GetAddOnCatalogCommand());

        const states = models()[0].groups.flatMap((group) =>
            group.sources.flatMap((source) => source.addOns.map((addOn) => addOn.stateText)),
        );
        expect(new Set(states)).toEqual(
            new Set(["Allowed", "Not allowed yet", "Declined this session", "Enabled", "Disabled"]),
        );
    });

    it.each([
        {
            name: "Palette",
            facts: [
                { label: "Folder", value: ".camunda/plugins/palette" },
                { label: "Allowed in", value: "every worktree of /work" },
            ],
            note: undefined,
        },
        {
            name: "bpmnlint-plugin-acme@1.0.0",
            facts: [
                { label: "Folder", value: "node_modules/bpmnlint-plugin-acme" },
                { label: "Version", value: "1.0.0" },
                { label: "Allowed in", value: "every worktree of /work" },
            ],
            note: "Code it already ran stays loaded until you reload the window.",
        },
    ])("gives revoked $name the review facts and note the core sends", ({ name, facts, note }) => {
        const { host, rowNamed } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());

        host.postMessage(new AddOnRequestCommand(1, { kind: "revoke", addOnId: rowNamed(name).id }));
        const revoked = rowNamed(name);

        expect([revoked.kind !== "elementTemplate" && revoked.review?.facts, revoked.note]).toEqual([facts, note]);
    });

    it.each<{
        when: string;
        search?: string;
        request: AddOnRequestPayload;
        result: AddOnActionResultPayload;
        revisions: number[];
        shows?: { name: string; stateText: string };
    }>([
        {
            when: "allow on a plugin",
            request: { kind: "allow", addOnId: RESIZE_TASKS, revision: 1 },
            result: { kind: "done", message: "Allowed Resize Tasks in every worktree of its repository. Open editors reload with it." },
            revisions: [1, 2],
            shows: { name: "Resize Tasks", stateText: "Allowed" },
        },
        {
            when: "allow on a rule package",
            request: { kind: "allow", addOnId: "rulePackage:/work/node_modules/@acme/bpmnlint-plugin-rules", revision: 1 },
            result: {
                kind: "done",
                message: "Allowed @acme/bpmnlint-plugin-rules@2.1.0 in every worktree of its repository. Open editors lint again with it.",
            },
            revisions: [1, 2],
            shows: { name: "@acme/bpmnlint-plugin-rules@2.1.0", stateText: "Allowed" },
        },
        { when: "allow on an unlisted add-on", request: { kind: "allow", addOnId: GONE, revision: 1 }, result: UNLISTED, revisions: [1] },
        {
            when: "the first allow on a stale view",
            search: "?stale=1",
            request: { kind: "allow", addOnId: RESIZE_TASKS, revision: 1 },
            result: { kind: "refused", reason: "staleView", message: "The list changed since you looked at it. Check it again, then allow." },
            revisions: [1, 2],
        },
        {
            when: "revoke on a plugin",
            request: { kind: "revoke", addOnId: "plugin:/work/.camunda/plugins/palette" },
            result: { kind: "done", message: "Revoked Palette in every worktree of its repository. Open editors reload without it." },
            revisions: [1, 2],
            shows: { name: "Palette", stateText: "Not allowed yet" },
        },
        {
            when: "revoke on a rule package",
            request: { kind: "revoke", addOnId: "rulePackage:/work/node_modules/bpmnlint-plugin-acme" },
            result: {
                kind: "done",
                message:
                    "Revoked bpmnlint-plugin-acme@1.0.0 in every worktree of its repository. Code it already ran stays loaded until you reload the window.",
            },
            revisions: [1, 2],
            shows: { name: "bpmnlint-plugin-acme@1.0.0", stateText: "Not allowed yet" },
        },
        { when: "revoke on an unlisted add-on", request: { kind: "revoke", addOnId: GONE }, result: UNLISTED, revisions: [1] },
        {
            when: "enable",
            request: { kind: "enable", addOnId: "template:config:/work/.camunda|legacy.json#0:Legacy Task@1" },
            result: { kind: "done" },
            revisions: [1, 2],
            shows: { name: "Legacy Task", stateText: "Enabled" },
        },
        {
            when: "disable",
            request: { kind: "disable", addOnId: "template:config:/work/.camunda|mail.json#0:Mail Task@1" },
            result: { kind: "done" },
            revisions: [1, 2],
            shows: { name: "Mail Task", stateText: "Disabled" },
        },
        { when: "disable on an unlisted add-on", request: { kind: "disable", addOnId: GONE }, result: UNLISTED, revisions: [1] },
        {
            when: "enableTemplates",
            request: { kind: "enableTemplates", sourceId: "config:/work/orders/.camunda" },
            result: { kind: "done" },
            revisions: [1, 2],
        },
        {
            when: "disableTemplates",
            request: { kind: "disableTemplates", sourceId: "config:/work/.camunda" },
            result: { kind: "done" },
            revisions: [1, 2],
        },
        {
            when: "removeMarketplace",
            request: { kind: "removeMarketplace", sourceId: "marketplace:broken" },
            result: { kind: "reportedByFlow" },
            revisions: [1, 2],
        },
        { when: "addMarketplace", request: { kind: "addMarketplace" }, result: { kind: "reportedByFlow" }, revisions: [1] },
        { when: "updateMarketplaces", request: { kind: "updateMarketplaces" }, result: { kind: "reportedByFlow" }, revisions: [1] },
        {
            when: "pruneCache",
            request: { kind: "pruneCache" },
            result: { kind: "done", message: "Removed 2 unused plugin copies." },
            revisions: [1],
        },
        { when: "refresh", request: { kind: "refresh" }, result: { kind: "done" }, revisions: [1, 2] },
    ])("answers $when as the core would and pushes a newer catalog only when it changed", ({ search, request, result, revisions, shows }) => {
        const { host, models, results, rowNamed } = previewAt(search);
        host.postMessage(new GetAddOnCatalogCommand());

        host.postMessage(new AddOnRequestCommand(1, request));

        expect([results(), models().map(({ revision }) => revision), shows && rowNamed(shows.name).stateText]).toEqual([
            [result],
            revisions,
            shows?.stateText,
        ]);
    });

    it("allows on the second try after refusing a stale view", () => {
        const { host, results, rowNamed } = previewAt("?stale=1");
        host.postMessage(new GetAddOnCatalogCommand());

        host.postMessage(new AddOnRequestCommand(1, { kind: "allow", addOnId: RESIZE_TASKS, revision: 1 }));
        host.postMessage(new AddOnRequestCommand(2, { kind: "allow", addOnId: RESIZE_TASKS, revision: 2 }));

        expect([results().map(({ kind }) => kind), rowNamed("Resize Tasks").stateText]).toEqual([["refused", "done"], "Allowed"]);
    });

    it("drops the marketplace it removes from the next catalog", () => {
        const { host, models } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());

        host.postMessage(new AddOnRequestCommand(1, { kind: "removeMarketplace", sourceId: "marketplace:broken" }));
        const marketplaces = models().at(-1)!.groups.find(({ kind }) => kind === "marketplaces");

        expect(marketplaces?.sources.map(({ id }) => id)).toEqual(["marketplace:shared"]);
    });

    it("switches a source's templates off and on again", () => {
        const { host, rowNamed } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());
        const source = { sourceId: "config:/work/.camunda" };

        host.postMessage(new AddOnRequestCommand(1, { kind: "disableTemplates", ...source }));
        const off = rowNamed("Mail Task");
        host.postMessage(new AddOnRequestCommand(2, { kind: "enableTemplates", ...source }));

        expect([off.note, off.actions, rowNamed("Mail Task").actions]).toEqual([
            "Its source is disabled.",
            [],
            [{ kind: "disable", label: "Disable" }],
        ]);
    });

    it.each([
        { search: "?state=loading", models: 0 },
        { search: "?state=empty", emptyText: "No BPMN plugins, bpmnlint rule packages or element templates in this workspace." },
        { search: "?state=noFolder", emptyText: "Open a folder to see the plugins, rule packages and element templates it brings." },
        { search: "?state=failed", problem: "Could not list the add-ons. The log says why." },
    ])("picks the catalog for $search", ({ search, models: count, emptyText, problem }) => {
        const { host, models } = previewAt(search);

        host.postMessage(new GetAddOnCatalogCommand());

        if (count === 0) expect(models()).toEqual([]);
        if (emptyText) expect([models()[0].groups, models()[0].emptyText]).toEqual([[], emptyText]);
        if (problem) expect(models()[0].problem).toBe(problem);
    });

    it.each([
        { search: "?state=onlyMarketplaces", groups: ["marketplaces"], emptyText: true, problem: false },
        { search: "?state=noMarketplace", groups: ["folder:/work", "folder:/billing"], emptyText: false, problem: false },
        { search: "?state=marketplacesFailed", groups: ["folder:/work", "folder:/billing", "marketplaces"], emptyText: false, problem: false },
        { search: "?state=rereadFailed", groups: ["folder:/work", "folder:/billing", "marketplaces"], emptyText: false, problem: true },
    ])("shows the groups $search names", ({ search, groups, emptyText, problem }) => {
        const { host, models } = previewAt(search);

        host.postMessage(new GetAddOnCatalogCommand());
        const [model] = models();

        expect([model.groups.map(({ id }) => id), model.emptyText !== undefined, model.problem !== undefined]).toEqual([
            groups,
            emptyText,
            problem,
        ]);
    });

    it("shows unreadable marketplaces with their problem and no source", () => {
        const { host, models } = previewAt("?state=marketplacesFailed");

        host.postMessage(new GetAddOnCatalogCommand());
        const marketplaces = models()[0].groups.at(-1);

        expect([marketplaces?.problem, marketplaces?.sources]).toEqual(["Could not read the registered marketplaces.", []]);
    });

    it("reveals the row a query flag names after the catalog", () => {
        const { host, replies, rowNamed } = previewAt("?reveal=Shared%20Mail");

        host.postMessage(new GetAddOnCatalogCommand());

        expect(replies.map(({ type }) => type)).toEqual(["BrandModeQuery", "AddOnCatalogQuery", "RevealAddOnsQuery"]);
        expect(reveals(replies)).toEqual([{ kind: "rows", revealId: 1, addOnIds: [rowNamed("Shared Mail").id] }]);
    });

    it("asks for what needs review after the catalog and a reveal when the preset flag says so", () => {
        const { host, replies } = previewAt("?reveal=Shared%20Mail&preset=needsReview");

        host.postMessage(new GetAddOnCatalogCommand());

        expect(reveals(replies).map(({ kind, revealId }) => [kind, revealId])).toEqual([
            ["rows", 1],
            ["needsReview", 2],
        ]);
    });

    it("asks for what needs review after the catalog when only the preset flag is set", () => {
        const { host, replies } = previewAt("?preset=needsReview");

        host.postMessage(new GetAddOnCatalogCommand());

        expect([replies.at(-2)?.type, reveals(replies)]).toEqual([
            "AddOnCatalogQuery",
            [{ kind: "needsReview", revealId: 2 }],
        ]);
    });

    it("lists nothing to review once every add-on is reviewed", () => {
        const { host, models } = previewAt("?state=allReviewed");

        host.postMessage(new GetAddOnCatalogCommand());
        const rows = models()[0].groups.flatMap((group) => group.sources.flatMap((source) => source.addOns));
        const codeRows = rows.filter(({ kind }) => kind !== "elementTemplate");

        expect([
            rows.filter(({ actions }) => actions.some(({ kind }) => kind === "allow")),
            codeRows.length > 0,
            codeRows.filter(({ stateText }) => stateText === "Allowed").length > 0,
        ]).toEqual([[], true, true]);
    });

    it.each([
        { search: "", mode: { theme: "light" } },
        { search: "?theme=dark", mode: { theme: "dark" } },
        { search: "?theme=hc", mode: { theme: "dark", contrast: "hoch" } },
    ] as const)("posts the brand mode a host would for $search, before the catalog", ({ search, mode }) => {
        const { host, replies } = previewAt(search);

        host.postMessage(new GetAddOnCatalogCommand());

        expect(replies[0]).toEqual(new BrandModeQuery(mode));
    });
});
