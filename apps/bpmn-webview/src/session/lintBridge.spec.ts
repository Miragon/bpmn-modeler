import { describe, expect, it, vi } from "vitest";

import {
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
    type Command,
    type Query,
} from "@miragon/bpmn-modeler-shared";
import type { LintingOptions } from "@miragon/bpmn-modeler";
import type { LintRunEvent } from "@miragon/bpmn-modeler-types";

import type { SurfaceHandle } from "../surface";
import { createLintBridge } from "./lintBridge";

const mocks = vi.hoisted(() => ({ lintModule: { name: "lint-module" } }));

vi.mock("../surfaceModules", () => ({
    loadLintModule: vi.fn(async () => mocks.lintModule),
}));

function createHost() {
    const sent: (Command | Query)[] = [];
    return {
        sent,
        postMessage: vi.fn((message: Command | Query) => {
            sent.push(message);
        }),
    };
}

function lintingSurface() {
    return {
        applyLintResults: vi.fn(),
        applyLintingDisabled: vi.fn(),
        startInPageLinting: vi.fn(),
    };
}

const viewerSurface = { loadDiagram: vi.fn() };

function hostTierBridge<Surface extends object>(surface: Surface) {
    const host = createHost();
    const bridge = createLintBridge(
        host,
        { linting: undefined, onLintResults: undefined },
        () => surface as unknown as SurfaceHandle,
    );
    return { host, bridge, surface };
}

const lintRun: LintRunEvent = { results: { Task_1: [] }, unresolved: ["missing-plugin"] };

describe("createLintBridge", () => {
    it("builds the surfaces in the external tier a real host uses", async () => {
        const { bridge } = hostTierBridge(lintingSurface());

        const { linting } = await bridge.surfaceOptions();

        expect(linting).toEqual({ results: "external", module: mocks.lintModule });
    });

    it("keeps an injected tier and lint-run sink", async () => {
        const host = createHost();
        const linting: LintingOptions = false;
        const onLintResults = vi.fn();
        const bridge = createLintBridge(
            host,
            { linting, onLintResults },
            () => lintingSurface() as unknown as SurfaceHandle,
        );

        const options = await bridge.surfaceOptions();
        options.onLintResults(lintRun);

        expect(options.linting).toBe(false);
        expect(onLintResults).toHaveBeenCalledWith(lintRun);
        expect(host.postMessage).not.toHaveBeenCalled();
    });

    it("tells the host when the user toggles linting", async () => {
        const { host, bridge } = hostTierBridge(lintingSurface());

        (await bridge.surfaceOptions()).onLintingToggled(false);

        expect(host.sent).toEqual([
            expect.objectContaining({ type: "SetLintingEnabledCommand", enabled: false }),
        ]);
    });

    it("echoes the config token the host sent last with every lint run", async () => {
        const { host, bridge } = hostTierBridge(lintingSurface());
        const { onLintResults } = await bridge.surfaceOptions();

        onLintResults(lintRun);
        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery({ extends: [] }, "tok-1"));
        onLintResults(lintRun);
        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery({ extends: [] }, "tok-2"));
        onLintResults(lintRun);

        expect(
            host.sent.map((command) => (command as { configToken?: string }).configToken),
        ).toEqual([undefined, "tok-1", "tok-2"]);
        expect(host.sent[0]).toMatchObject({
            type: "UpdateLintResultsCommand",
            results: lintRun.results,
            unresolved: ["missing-plugin"],
        });
    });

    it("drops the token when the host falls back to the payload-free default tier", async () => {
        const { host, bridge } = hostTierBridge(lintingSurface());
        const { onLintResults } = await bridge.surfaceOptions();

        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery({ extends: [] }, "tok-1"));
        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery());
        onLintResults(lintRun);

        expect(host.sent).toEqual([
            expect.objectContaining({ type: "UpdateLintResultsCommand", configToken: undefined }),
        ]);
    });

    it("hands the host's lint pushes to a linting surface", () => {
        const { bridge, surface } = hostTierBridge(lintingSurface());
        const config = { extends: ["bpmnlint:recommended"] };

        bridge.handlers.BpmnlintResultsQuery(new BpmnlintResultsQuery({ Task_1: [] }));
        bridge.handlers.BpmnLintDisabledQuery();
        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery(config, "tok-1"));

        expect(surface.applyLintResults).toHaveBeenCalledWith({ Task_1: [] });
        expect(surface.applyLintingDisabled).toHaveBeenCalledOnce();
        expect(surface.startInPageLinting).toHaveBeenCalledWith(config, "tok-1");
    });

    it("ignores lint pushes on the readonly viewer but still tracks the token", async () => {
        const { host, bridge } = hostTierBridge(viewerSurface);
        const { onLintResults } = await bridge.surfaceOptions();

        bridge.handlers.BpmnlintResultsQuery(new BpmnlintResultsQuery(null));
        bridge.handlers.BpmnLintDisabledQuery();
        bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery(undefined, "tok-1"));
        onLintResults(lintRun);

        expect(host.sent).toEqual([
            expect.objectContaining({ type: "UpdateLintResultsCommand", configToken: "tok-1" }),
        ]);
    });

    it("still tracks the config token when the surface rejects the in-page config", async () => {
        const surface = lintingSurface();
        surface.startInPageLinting.mockImplementation(() => {
            throw new Error("Modeler is not initialized!");
        });
        const { host, bridge } = hostTierBridge(surface);
        const { onLintResults } = await bridge.surfaceOptions();

        expect(() =>
            bridge.handlers.BpmnlintInPageQuery(new BpmnlintInPageQuery({ extends: [] }, "tok-1")),
        ).toThrow("Modeler is not initialized!");
        onLintResults(lintRun);

        expect(host.sent).toEqual([
            expect.objectContaining({ type: "UpdateLintResultsCommand", configToken: "tok-1" }),
        ]);
    });

    it("lets a surface that rejects a lint push throw to the caller", () => {
        const surface = lintingSurface();
        surface.applyLintResults.mockImplementation(() => {
            throw new Error("Modeler is not initialized!");
        });
        const { bridge } = hostTierBridge(surface);

        expect(() => bridge.handlers.BpmnlintResultsQuery(new BpmnlintResultsQuery({}))).toThrow(
            "Modeler is not initialized!",
        );
    });
});
