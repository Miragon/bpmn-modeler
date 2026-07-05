import { homedir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

// The controller touches only these two `vscode` surfaces; progress and
// persistence are on injected ports stubbed directly.
vi.mock("vscode", () => ({
    window: { showInputBox: vi.fn() },
    commands: { registerCommand: vi.fn(() => ({ dispose: vi.fn() })) },
}));

import { commands, window } from "vscode";
import {
    ADD_MARKETPLACE_CMD,
    expandHomePath,
    TemplateMarketplaceController,
    UPDATE_MARKETPLACES_CMD,
} from "./TemplateMarketplaceController";

/**
 * Exposes the captured command handlers so a test can invoke a command as VS
 * Code would; `withProgress` runs its task inline so the fetch is observable.
 */
function createController() {
    const marketplaceSvc = {
        addMarketplace: vi.fn().mockResolvedValue(undefined),
        updateAll: vi.fn().mockResolvedValue({ succeeded: 1, failures: [] }),
    };
    const templatesSvc = { setElementTemplates: vi.fn().mockResolvedValue(undefined) };
    const editorStore = { getEditorIds: vi.fn().mockReturnValue([]) };
    const settings = { addMarketplace: vi.fn().mockResolvedValue(undefined) };
    const notifier = {
        withProgress: vi.fn((_title: string, task: () => Promise<unknown>) => task()),
        showInfo: vi.fn(),
        showError: vi.fn(),
        notifyError: vi.fn(),
    };

    const handlers = new Map<string, () => Promise<void>>();
    (commands.registerCommand as Mock).mockImplementation((id: string, cb: () => Promise<void>) => {
        handlers.set(id, cb);
        return { dispose: vi.fn() };
    });

    const controller = new TemplateMarketplaceController(
        marketplaceSvc as never,
        templatesSvc as never,
        editorStore as never,
        settings as never,
        notifier as never,
    );
    controller.register({ subscriptions: [] } as never);

    return { handlers, marketplaceSvc, templatesSvc, editorStore, settings, notifier };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe("expandHomePath", () => {
    it("expands a bare ~ to the home directory", () => {
        expect(expandHomePath("~")).toBe(homedir());
    });

    it("expands ~/sub to a home-relative absolute path", () => {
        expect(expandHomePath("~/templates")).toBe(join(homedir(), "templates"));
        expect(expandHomePath("~\\templates")).toBe(join(homedir(), "templates"));
    });

    it("leaves ~user and non-tilde inputs untouched", () => {
        expect(expandHomePath("~bob/x")).toBe("~bob/x");
        expect(expandHomePath("/abs/path")).toBe("/abs/path");
        expect(expandHomePath("https://github.com/a/b")).toBe("https://github.com/a/b");
    });
});

describe("TemplateMarketplaceController.addMarketplace", () => {
    it("expands ~ before fetching and persisting", async () => {
        const { handlers, marketplaceSvc, settings } = createController();
        (window.showInputBox as Mock).mockResolvedValue("~/templates");

        await handlers.get(ADD_MARKETPLACE_CMD)!();

        const expanded = join(homedir(), "templates");
        expect(marketplaceSvc.addMarketplace).toHaveBeenCalledWith(expanded);
        // Persisting the expanded path means a later Update never re-reads a `~`.
        expect(settings.addMarketplace).toHaveBeenCalledWith(expanded);
    });

    it("does not persist when the fetch fails", async () => {
        const { handlers, marketplaceSvc, settings, notifier } = createController();
        (window.showInputBox as Mock).mockResolvedValue("/bad/folder");
        marketplaceSvc.addMarketplace.mockRejectedValue(new Error("no marketplace.json"));

        await handlers.get(ADD_MARKETPLACE_CMD)!();

        expect(settings.addMarketplace).not.toHaveBeenCalled();
        expect(notifier.notifyError).toHaveBeenCalledOnce();
    });

    it("does nothing when the prompt is dismissed", async () => {
        const { handlers, marketplaceSvc } = createController();
        (window.showInputBox as Mock).mockResolvedValue(undefined);

        await handlers.get(ADD_MARKETPLACE_CMD)!();

        expect(marketplaceSvc.addMarketplace).not.toHaveBeenCalled();
    });

    it("accepts a ~ path in the input validator and rejects non-locations", async () => {
        const { handlers } = createController();
        (window.showInputBox as Mock).mockResolvedValue(undefined);

        await handlers.get(ADD_MARKETPLACE_CMD)!();

        // Exercise the validator captured at prompt time directly: `~/...` must
        // validate, since it expands to a local path.
        const options = (window.showInputBox as Mock).mock.calls[0][0];
        expect(options.validateInput("~/templates")).toBeUndefined();
        expect(options.validateInput("not-a-repo-or-path")).toEqual(expect.any(String));
    });

    it("accepts a gitlab.com URL in the input validator", async () => {
        const { handlers } = createController();
        (window.showInputBox as Mock).mockResolvedValue(undefined);

        await handlers.get(ADD_MARKETPLACE_CMD)!();

        const options = (window.showInputBox as Mock).mock.calls[0][0];
        expect(options.validateInput("https://gitlab.com/group/project")).toBeUndefined();
    });
});

describe("TemplateMarketplaceController.updateMarketplaces", () => {
    it("re-fetches all marketplaces and refreshes open editors", async () => {
        const { handlers, marketplaceSvc, templatesSvc, editorStore } = createController();
        editorStore.getEditorIds.mockReturnValue(["editor-1", "editor-2"]);

        await handlers.get(UPDATE_MARKETPLACES_CMD)!();

        expect(marketplaceSvc.updateAll).toHaveBeenCalledOnce();
        expect(templatesSvc.setElementTemplates).toHaveBeenCalledWith("editor-1");
        expect(templatesSvc.setElementTemplates).toHaveBeenCalledWith("editor-2");
    });

    it("shows a success toast with the refreshed count", async () => {
        const { handlers, marketplaceSvc, notifier } = createController();
        marketplaceSvc.updateAll.mockResolvedValue({ succeeded: 2, failures: [] });

        await handlers.get(UPDATE_MARKETPLACES_CMD)!();

        expect(notifier.showInfo).toHaveBeenCalledWith("Updated 2 marketplace(s).");
        expect(notifier.showError).not.toHaveBeenCalled();
    });

    it("notes when nothing is configured to update", async () => {
        const { handlers, marketplaceSvc, notifier } = createController();
        marketplaceSvc.updateAll.mockResolvedValue({ succeeded: 0, failures: [] });

        await handlers.get(UPDATE_MARKETPLACES_CMD)!();

        expect(notifier.showInfo).toHaveBeenCalledWith("No marketplaces configured to update.");
    });

    it("lists each failed marketplace and its reason on partial failure", async () => {
        const { handlers, marketplaceSvc, notifier } = createController();
        marketplaceSvc.updateAll.mockResolvedValue({
            succeeded: 1,
            failures: [
                { label: "github.com/acme/broken", reason: "could not read marketplace.json" },
            ],
        });

        await handlers.get(UPDATE_MARKETPLACES_CMD)!();

        expect(notifier.showInfo).not.toHaveBeenCalled();
        expect(notifier.showError).toHaveBeenCalledWith(
            "Updated 1 of 2 marketplaces. Failed:\ngithub.com/acme/broken: could not read marketplace.json",
        );
    });
});
