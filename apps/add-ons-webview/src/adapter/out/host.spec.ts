import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    AddOnActionResultQuery,
    AddOnCatalogPayload,
    AddOnCatalogQuery,
    AddOnRequestCommand,
    AddOnsViewCommandType,
    BrandModeQuery,
    GetAddOnCatalogCommand,
    HostApiImpl,
    LogErrorCommand,
    LogInfoCommand,
    MessageOfType,
    MockHostApi,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./host";

const COMMANDS: { [Type in AddOnsViewCommandType]: MessageOfType<Type> } = {
    LogInfoCommand: new LogInfoCommand("info"),
    LogErrorCommand: new LogErrorCommand("error"),
    GetAddOnCatalogCommand: new GetAddOnCatalogCommand(),
    AddOnRequestCommand: new AddOnRequestCommand(1, { kind: "refresh" }),
};

type Reply = AddOnCatalogQuery | AddOnActionResultQuery | RevealAddOnsQuery | BrandModeQuery;

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
    const rowNamed = (name: string, model = models().at(-1)!) =>
        rows(model).find((row) => row.name === name)!;

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
            new Set(["Allowed", "Not allowed yet", "Changed, review needed", "Declined this session", "Folder gone", "Enabled", "Disabled"]),
        );
    });

    it("allows a row and pushes a newer revision that shows it allowed", () => {
        const { host, models, results, rowNamed } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());
        const [first] = models();
        const row = rowNamed("Resize Tasks", first);

        host.postMessage(new AddOnRequestCommand(1, { kind: "allow", addOnId: row.id, revision: first.revision }));

        expect(results()).toEqual([{ kind: "done", message: "Allowed Resize Tasks. Open editors reload with it." }]);
        expect([models().at(-1)!.revision > first.revision, rowNamed("Resize Tasks").stateText]).toEqual([true, "Allowed"]);
    });

    it.each([
        { name: "Palette", request: "revoke", result: { kind: "done", message: "Revoked Palette. Open editors reload without it." }, stateText: "Not allowed yet" },
        { name: "Old Tool", request: "revoke", result: { kind: "done", message: "Forgot Old Tool." }, stateText: undefined },
        { name: "bpmnlint-plugin-acme", request: "inspect", result: { kind: "done", message: "Read bpmnlint-plugin-acme. Review what it covers, then allow this content." }, stateText: "Not allowed yet" },
        { name: "Mail Task", request: "disable", result: { kind: "done" }, stateText: "Disabled" },
        { name: "Legacy Task", request: "enable", result: { kind: "done" }, stateText: "Enabled" },
        { name: "Gone", request: "revoke", result: { kind: "refused", reason: "unknownAddOn", message: "This add-on is no longer listed." }, stateText: undefined },
    ] as const)("answers $request on $name as the core would", ({ name, request, result, stateText }) => {
        const { host, results, rowNamed } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());
        const id = rowNamed(name)?.id ?? "plugin:/gone";

        host.postMessage(new AddOnRequestCommand(1, { kind: request, addOnId: id }));

        expect([results()[0], rowNamed(name)?.stateText]).toEqual([result, stateText]);
    });

    it.each([
        { request: { kind: "disableTemplates", sourceId: "config:/work/.camunda" }, result: { kind: "done" } },
        { request: { kind: "enableTemplates", sourceId: "config:/work/orders/.camunda" }, result: { kind: "done" } },
        { request: { kind: "removeMarketplace", sourceId: "marketplace:broken" }, result: { kind: "reportedByFlow" } },
        { request: { kind: "addMarketplace" }, result: { kind: "reportedByFlow" } },
        { request: { kind: "updateMarketplaces" }, result: { kind: "reportedByFlow" } },
        { request: { kind: "pruneCache" }, result: { kind: "done", message: "Removed 2 unused plugin copies." } },
        { request: { kind: "refresh" }, result: { kind: "done" } },
    ] as const)("answers $request.kind", ({ request, result }) => {
        const { host, results } = previewAt();
        host.postMessage(new GetAddOnCatalogCommand());

        host.postMessage(new AddOnRequestCommand(1, request));

        expect(results()).toEqual([result]);
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
            rows.filter(({ actions }) => actions.some(({ kind }) => kind === "allow" || kind === "inspect")),
            codeRows.length > 0,
            codeRows.filter(({ stateText }) => stateText === "Allowed").length > 0,
        ]).toEqual([[], true, true]);
    });

    it("refuses the first allow as stale when asked to", () => {
        const { host, models, results, rowNamed } = previewAt("?stale=1");
        host.postMessage(new GetAddOnCatalogCommand());
        const row = rowNamed("Resize Tasks");

        host.postMessage(new AddOnRequestCommand(1, { kind: "allow", addOnId: row.id, revision: models()[0].revision }));

        expect(results()[0]).toMatchObject({ kind: "refused", reason: "staleView" });
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
