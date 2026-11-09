import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import {
    createTemplateMarketplaceService,
    MarketplaceAddAnswer,
    MarketplaceCommands,
} from "@miragon/bpmn-modeler-core";
import { createTestHost, RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import { resetVscodeWindow, vscodeWindow } from "../../../__fixtures__/vscodeWindowFake";
import {
    ADD_MARKETPLACE_CMD,
    reloadForUnregisteredSetting,
    REMOVE_MARKETPLACE_CMD,
    TemplateMarketplaceController,
    UPDATE_MARKETPLACES_CMD,
} from "./TemplateMarketplaceController";

/** `showErrorWithReload` is VS Code-only, so the port's recording fake lacks it. */
class ReloadRecordingNotifier extends RecordingNotifier {
    readonly reloadErrors: string[] = [];

    async showErrorWithReload(message: string): Promise<void> {
        this.reloadErrors.push(message);
    }
}

/** The core's flows over an in-memory host: `/work/a` is registered, `/work/b` is not. */
function registeredController(answers: MarketplaceAddAnswer[] = [], removed: string[] = []) {
    const marketplace = (id: string) => ({
        [`/work/${id}/marketplace.json`]: JSON.stringify({ sources: [{ path: "templates" }] }),
        [`/work/${id}/templates/${id}.json`]: JSON.stringify({
            id,
            name: id,
            appliesTo: ["bpmn:Task"],
            properties: [],
        }),
    });
    const host = createTestHost({
        folders: ["/work"],
        files: { ...marketplace("a"), ...marketplace("b") },
        settings: { marketplaces: ["/work/a"] },
        marketplaceAnswers: answers,
        promptAnswers: { marketplaceRemoval: removed },
    });
    const notifier = new ReloadRecordingNotifier();
    const context = { subscriptions: [] as { dispose(): void }[] };
    new TemplateMarketplaceController(
        new MarketplaceCommands({
            marketplaces: createTemplateMarketplaceService({
                workspace: host.workspace,
                settings: host.settings,
                notifier,
                tokens: host.tokens,
                tokenPrompt: host.tokenPrompt,
                cacheRoot: "/cache",
                homeDir: "/home/ada",
            }),
            templates: { reloadMarketplaceTemplates: async () => undefined },
            registrations: host.marketplaceRegistrations,
            prompt: host.marketplacePrompt,
            picker: host.picker,
            notifier,
            homeDir: "/home/ada",
            explainAddFailure: reloadForUnregisteredSetting(notifier),
        }),
    ).register(context);
    const run = (command: string) => vscodeWindow.registeredCommands.get(command)!();
    return {
        run,
        context,
        notifier,
        registrations: host.marketplaceRegistrations,
        marketplaces: host.settings.values.marketplaces,
    };
}

beforeEach(() => {
    resetVscodeWindow();
});

describe("TemplateMarketplaceController", () => {
    it("registers its three commands with the extension", () => {
        const { context } = registeredController();

        expect([...vscodeWindow.registeredCommands.keys()]).toEqual([
            ADD_MARKETPLACE_CMD,
            UPDATE_MARKETPLACES_CMD,
            REMOVE_MARKETPLACE_CMD,
        ]);
        expect(context.subscriptions).toHaveLength(3);
    });

    it("runs the core's add, update and remove flows", async () => {
        const { run, notifier, marketplaces } = registeredController(
            [{ location: "/work/b", scope: "project" }],
            ["/work/a"],
        );

        await run(ADD_MARKETPLACE_CMD);
        await run(UPDATE_MARKETPLACES_CMD);
        await run(REMOVE_MARKETPLACE_CMD);

        expect(marketplaces).toEqual(["/work/b"]);
        expect(notifier.infos).toEqual([
            "Marketplace added.",
            "Updated 2 marketplace(s).",
            "Removed 1 marketplace(s).",
        ]);
    });

    it("steers to a window reload instead of the failure toast when VS Code has not registered the settings key yet", async () => {
        const { run, notifier, registrations } = registeredController([
            { location: "/work/b", scope: "project" },
        ]);
        // VS Code's ERROR_UNKNOWN_KEY: the `marketplaces` contribution is absent
        // from a window not reloaded since an in-place update.
        vi.spyOn(registrations, "register").mockRejectedValue(
            new Error(
                "Unable to write to Workspace Settings because " +
                    "miragon.bpmnModeler.marketplaces is not a registered configuration.",
            ),
        );

        await run(ADD_MARKETPLACE_CMD);

        expect(notifier.reloadErrors).toEqual([
            "The BPMN Modeler extension was just updated. Reload the window to " +
                "finish enabling marketplaces, then add it again.",
        ]);
        expect(notifier.errors).toEqual([]);
    });

    it("leaves any other add failure to the core's toast", async () => {
        const { run, notifier, registrations } = registeredController([
            { location: "/work/b", scope: "project" },
        ]);
        vi.spyOn(registrations, "register").mockRejectedValue(new Error("disk full"));

        await run(ADD_MARKETPLACE_CMD);

        expect(notifier.reloadErrors).toEqual([]);
        expect(notifier.errors).toEqual(["Failed to add marketplace.\ndisk full"]);
    });
});
