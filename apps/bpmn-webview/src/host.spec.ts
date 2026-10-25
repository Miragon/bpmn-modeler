import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    ApplyDiffHighlightsQuery,
    DiagramFormattedCommand,
    DiffReadyCommand,
    GetBpmnFileCommand,
    GetBpmnlintConfigCommand,
    GetBpmnModelerSettingCommand,
    GetClipboardCommand,
    GetElementTemplatesCommand,
    GetPropertiesPanelStateCommand,
    HostApiImpl,
    MockHostApi,
    RequestFocusCommand,
    SearchWorkspaceDefinitionsCommand,
    SwapCompareSidesCommand,
    WorkspaceDefinitionsQuery,
    type Command,
} from "@miragon/bpmn-modeler-shared";
import { computeDiff } from "@miragon/bpmn-modeler/diff";

import { MOCK_BPMN_XML, MOCK_NEUTRAL_BPMN_XML } from "./__fixtures__/mock-bpmn";
import { MOCK_DIFF_AFTER_XML, MOCK_DIFF_BEFORE_XML } from "./__fixtures__/mock-diff";
import { getHostApi } from "./host";

vi.mock("@miragon/bpmn-modeler/diff", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@miragon/bpmn-modeler/diff")>();
    return { ...actual, computeDiff: vi.fn(actual.computeDiff) };
});

type Reply = { type: string } & Record<string, unknown>;

describe("getHostApi", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("serves the in-browser mock only to the development preview", () => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        vi.stubEnv("NODE_ENV", "development");

        const host = getHostApi();

        expect(host).toBeInstanceOf(MockHostApi);
        expect(host).not.toBeInstanceOf(HostApiImpl);
    });

    it("talks to the embedding host in every other build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const vsCodeApi = { getState: vi.fn(), setState: vi.fn(), postMessage: vi.fn() };
        vi.stubGlobal("acquireVsCodeApi", () => vsCodeApi);
        const command = new GetBpmnFileCommand();

        const host = getHostApi();
        host.postMessage(command);

        expect(host).toBeInstanceOf(HostApiImpl);
        expect(vsCodeApi.postMessage).toHaveBeenCalledWith(command);
    });
});

describe("development preview host", () => {
    let replies: Reply[];
    const collectReply = (event: MessageEvent<Reply>) => replies.push(event.data);
    const repliesOfType = (type: string) => replies.filter((reply) => reply.type === type);

    function previewHost(search = "") {
        window.history.replaceState(null, "", `/${search}`);
        vi.stubEnv("NODE_ENV", "development");
        return getHostApi();
    }

    beforeEach(() => {
        replies = [];
        window.addEventListener("message", collectReply);
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        vi.spyOn(console, "debug").mockImplementation(() => undefined);
    });

    afterEach(() => {
        window.removeEventListener("message", collectReply);
        window.history.replaceState(null, "", "/");
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.mocked(computeDiff).mockClear();
    });

    describe("document per ?mode=", () => {
        it.each([
            ["", MOCK_BPMN_XML, "c7", "modeler"],
            ["?mode=modeler", MOCK_BPMN_XML, "c7", "modeler"],
            ["?mode=neutral", MOCK_NEUTRAL_BPMN_XML, undefined, "modeler"],
            ["?mode=diff-before", MOCK_DIFF_BEFORE_XML, "c7", "viewer"],
            ["?mode=diff-after", MOCK_DIFF_AFTER_XML, "c7", "viewer"],
        ])("serves %j as a %s document", (search, content, engine, viewerMode) => {
            previewHost(search).postMessage(new GetBpmnFileCommand());

            expect(repliesOfType("BpmnFileQuery")).toEqual([
                expect.objectContaining({ content, engine, viewerMode }),
            ]);
        });

        it("falls back to the modeler and says so for an unknown mode", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            previewHost("?mode=bogus").postMessage(new GetBpmnFileCommand());

            expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unknown ?mode=bogus"));
            expect(repliesOfType("BpmnFileQuery")[0]).toMatchObject({ content: MOCK_BPMN_XML });
        });

        it("treats an empty mode as the default without a warning", () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

            previewHost("?mode=").postMessage(new GetBpmnFileCommand());

            expect(warn).not.toHaveBeenCalled();
        });
    });

    it.each<[Command, string]>([
        [new GetElementTemplatesCommand(), "ElementTemplatesQuery"],
        [new GetBpmnModelerSettingCommand(), "BpmnModelerSettingQuery"],
        [new GetPropertiesPanelStateCommand(), "PropertiesPanelStateQuery"],
        [new RequestFocusCommand(), "TakeFocusQuery"],
        [new GetClipboardCommand(), "ClipboardQuery"],
        [new GetBpmnlintConfigCommand(), "BpmnlintResultsQuery"],
    ])("answers %o with a %s", (request, replyType) => {
        previewHost().postMessage(request);

        expect(replies.map((reply) => reply.type)).toEqual([replyType]);
    });

    it("seeds the state on the first update and merges later ones", () => {
        const host = previewHost();

        host.updateState({ mode: "view" });
        host.updateState({ panelVisible: false });

        expect(host.getState()).toEqual({ mode: "view", panelVisible: false });
    });

    it("answers a definition search for the request that asked", () => {
        previewHost().postMessage(new SearchWorkspaceDefinitionsCommand(7, "message", "order"));

        const [answer] = repliesOfType("WorkspaceDefinitionsQuery") as unknown as [
            WorkspaceDefinitionsQuery,
        ];
        expect(answer.requestId).toBe(7);
        expect(answer.definitions.map((definition) => definition.name)).toEqual(["OrderPlaced"]);
    });

    describe("diff preview", () => {
        it.each([
            ["?mode=diff-before", "before", "before.bpmn"],
            ["?mode=diff-after", "after", "after.bpmn"],
        ])("paints the %s pane once it is ready", async (search, side, paneFilename) => {
            const expected = await computeDiff(MOCK_DIFF_BEFORE_XML, MOCK_DIFF_AFTER_XML);
            vi.mocked(computeDiff).mockClear();

            previewHost(search).postMessage(new DiffReadyCommand());

            await vi.waitFor(() =>
                expect(repliesOfType("ApplyDiffHighlightsQuery")).toHaveLength(1),
            );
            const [highlights] = repliesOfType(
                "ApplyDiffHighlightsQuery",
            ) as unknown as ApplyDiffHighlightsQuery[];
            expect(highlights).toMatchObject({
                side,
                origin: "compare-files",
                paneFilename,
                counts: expected.counts,
                navigationOrder: expected.navigationOrder,
            });
            const { added, removed, changed, layoutChanged } = highlights.counts;
            expect(added + removed + changed + layoutChanged).toBeGreaterThan(0);
        });

        it("computes the fixture diff only once per preview", async () => {
            const host = previewHost("?mode=diff-after");

            host.postMessage(new DiffReadyCommand());
            await vi.waitFor(() =>
                expect(repliesOfType("ApplyDiffHighlightsQuery")).toHaveLength(1),
            );
            host.postMessage(new DiffReadyCommand());
            await vi.waitFor(() =>
                expect(repliesOfType("ApplyDiffHighlightsQuery")).toHaveLength(2),
            );

            expect(computeDiff).toHaveBeenCalledOnce();
        });

        it("leaves the pane unpainted when the fixture diff fails", async () => {
            const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
            vi.mocked(computeDiff).mockRejectedValueOnce(new Error("moddle failed"));

            previewHost("?mode=diff-after").postMessage(new DiffReadyCommand());

            await vi.waitFor(() =>
                expect(error).toHaveBeenCalledWith(
                    expect.stringContaining("Failed to compute mock diff"),
                    expect.any(Error),
                ),
            );
            expect(repliesOfType("ApplyDiffHighlightsQuery")).toHaveLength(0);
        });

        it("ignores a ready pane outside the diff modes", async () => {
            previewHost().postMessage(new DiffReadyCommand());
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(computeDiff).not.toHaveBeenCalled();
            expect(replies).toEqual([]);
        });
    });

    it.each<[string, string, Command]>([
        ["a format report", "", new DiagramFormattedCommand("formatted", [])],
        ["a compare-sides swap", "?mode=diff-before", new SwapCompareSidesCommand()],
    ])("takes %s without throwing or replying", (_, search, command) => {
        const host = previewHost(search);

        expect(() => host.postMessage(command)).not.toThrow();
        expect(replies).toEqual([]);
    });
});
