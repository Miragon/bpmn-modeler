import { Saveable } from "@theia/core/lib/browser/saveable";
import { afterEach, describe, expect, it, vi } from "vitest";

const openShouldSaveDialog = vi.hoisted(() => vi.fn());

vi.mock("@theia/core/lib/browser/secondary-window-handler", () => ({
    SecondaryWindowHandler: class {},
    getAllWidgetsFromSecondaryWindow: (secondaryWindow: Window & { widgets?: unknown[] }) =>
        secondaryWindow.widgets,
}));

vi.mock("@theia/core/lib/browser/saveable", () => ({
    Saveable: {
        isDirty: vi.fn((candidate: { dirty?: boolean }) => candidate.dirty === true),
        save: vi.fn(async (candidate: { dirty?: boolean }) => {
            candidate.dirty = false;
        }),
    },
    ShouldSaveDialog: class {
        open(): Promise<boolean | undefined> {
            return openShouldSaveDialog();
        }
    },
}));

import { ModelerSecondaryWindowCloseContribution } from "./modeler-secondary-window-close-contribution";

function widget(closable = true) {
    return {
        close: vi.fn(),
        title: { closable },
    };
}

function modelerWidget() {
    return {
        ...widget(),
        id: "modeler",
        isDisposed: false,
        dirty: false,
        onDirtyChanged: vi.fn(),
        onContentChanged: vi.fn(),
        save: vi.fn().mockResolvedValue(undefined),
        revert: vi.fn().mockResolvedValue(undefined),
        node: { inert: false },
        resource: { toString: () => "file:///process.bpmn" },
        viewType: "bpmn-modeler.bpmn",
    };
}

describe("ModelerSecondaryWindowCloseContribution", () => {
    afterEach(() => {
        openShouldSaveDialog.mockReset();
        vi.clearAllMocks();
    });

    it("redirects Ctrl+W to the active tab in the focused secondary window", () => {
        const inactiveWidget = widget();
        const activeWidget = widget();
        const secondaryWindow = { widgets: [inactiveWidget, activeWidget] } as unknown as Window;
        const registerHandler = vi.fn();
        const contribution = new ModelerSecondaryWindowCloseContribution();
        Object.assign(contribution, {
            commands: { registerHandler },
            secondaryWindowHandler: {
                getFocusedWindow: () => secondaryWindow,
                getTabBarFor: () => ({ currentTitle: { owner: activeWidget } }),
            },
        });

        contribution.onStart();

        expect(registerHandler).toHaveBeenCalledOnce();
        expect(registerHandler.mock.calls[0][0]).toBe("core.close.main.tab");
        const handler = registerHandler.mock.calls[0][1];
        expect(handler.isEnabled()).toBe(true);
        handler.execute();
        expect(activeWidget.close).toHaveBeenCalledOnce();
        expect(inactiveWidget.close).not.toHaveBeenCalled();
    });

    it("leaves Ctrl+W to Theia's default handler while the main window is focused", () => {
        const registerHandler = vi.fn();
        const contribution = new ModelerSecondaryWindowCloseContribution();
        Object.assign(contribution, {
            commands: { registerHandler },
            secondaryWindowHandler: { getFocusedWindow: () => window },
        });

        contribution.onStart();

        const handler = registerHandler.mock.calls[0][1];
        expect(handler.isEnabled()).toBe(false);
    });

    it("does not close a non-closable secondary tab", () => {
        const activeWidget = widget(false);
        const secondaryWindow = { widgets: [activeWidget] } as unknown as Window;
        const registerHandler = vi.fn();
        const contribution = new ModelerSecondaryWindowCloseContribution();
        Object.assign(contribution, {
            commands: { registerHandler },
            secondaryWindowHandler: {
                getFocusedWindow: () => secondaryWindow,
                getTabBarFor: () => ({ currentTitle: { owner: activeWidget } }),
            },
        });

        contribution.onStart();

        const handler = registerHandler.mock.calls[0][1];
        expect(handler.isEnabled()).toBe(false);
        expect(handler.execute()).toBeUndefined();
        expect(activeWidget.close).not.toHaveBeenCalled();
    });

    it("prompts and saves a modeler that becomes dirty during shutdown", async () => {
        const contribution = new ModelerSecondaryWindowCloseContribution();
        const candidate = modelerWidget();
        const executeCommand = vi.fn().mockImplementation(async () => {
            candidate.dirty = true;
            return true;
        });
        openShouldSaveDialog.mockResolvedValue(true);
        Object.assign(contribution, {
            commands: { executeCommand },
            secondaryWindowHandler: { modelerWidgets: [candidate] },
        });
        const app = {
            shell: {
                canSaveAll: vi.fn().mockReturnValue(false),
                widgets: [candidate],
            },
        };
        const shutdown = contribution.onWillStop(app as never);
        expect(shutdown).toBeDefined();
        const prepared = await shutdown?.prepare?.();
        await expect(shutdown?.action(prepared)).resolves.toBe(true);

        expect(executeCommand).toHaveBeenNthCalledWith(
            1,
            "bpmn-modeler.flushDocument",
            "file:///process.bpmn",
            "bpmn-modeler.bpmn",
        );
        expect(executeCommand).toHaveBeenCalledTimes(2);
        expect(openShouldSaveDialog).toHaveBeenCalledOnce();
        expect(Saveable.save).toHaveBeenCalledWith(candidate);
        expect(candidate.dirty).toBe(false);
    });

    it("vetoes shutdown when a detached modeler cannot be flushed", async () => {
        const contribution = new ModelerSecondaryWindowCloseContribution();
        const candidate = modelerWidget();
        Object.assign(contribution, {
            commands: { executeCommand: vi.fn().mockResolvedValue(false) },
            secondaryWindowHandler: { modelerWidgets: [candidate] },
        });
        const shutdown = contribution.onWillStop({
            shell: {
                canSaveAll: vi.fn().mockReturnValue(false),
                widgets: [candidate],
            },
        } as never);
        const prepared = await shutdown?.prepare?.();

        await expect(shutdown?.action(prepared)).resolves.toBe(false);
    });

    it("keeps the modeler quiesced until the shutdown prompt is resolved", async () => {
        let finishPrompt: (decision: boolean | undefined) => void = () => undefined;
        const contribution = new ModelerSecondaryWindowCloseContribution();
        const candidate = modelerWidget();
        openShouldSaveDialog.mockImplementation(
            () =>
                new Promise<boolean | undefined>((resolve) => {
                    finishPrompt = resolve;
                }),
        );
        Object.assign(contribution, {
            commands: {
                executeCommand: vi.fn().mockImplementation(async () => {
                    candidate.dirty = true;
                    return true;
                }),
            },
            secondaryWindowHandler: { modelerWidgets: [candidate] },
        });
        const shutdown = contribution.onWillStop({
            shell: {
                canSaveAll: vi.fn().mockReturnValue(false),
                widgets: [candidate],
            },
        } as never);
        const prepared = await shutdown?.prepare?.();

        const shuttingDown = shutdown?.action(prepared);
        await vi.waitFor(() => expect(openShouldSaveDialog).toHaveBeenCalledOnce());
        expect(candidate.node.inert).toBe(true);
        finishPrompt(undefined);

        await expect(shuttingDown).resolves.toBe(false);
        expect(candidate.node.inert).toBe(false);
    });

    it("does not revert the modeler when shutdown proceeds without saving", async () => {
        const contribution = new ModelerSecondaryWindowCloseContribution();
        const candidate = modelerWidget();
        openShouldSaveDialog.mockResolvedValue(false);
        Object.assign(contribution, {
            commands: {
                executeCommand: vi.fn().mockImplementation(async () => {
                    candidate.dirty = true;
                    return true;
                }),
            },
            secondaryWindowHandler: { modelerWidgets: [candidate] },
        });
        const shutdown = contribution.onWillStop({
            shell: {
                canSaveAll: vi.fn().mockReturnValue(false),
                widgets: [candidate],
            },
        } as never);
        const prepared = await shutdown?.prepare?.();

        await expect(shutdown?.action(prepared)).resolves.toBe(true);
        expect(candidate.dirty).toBe(true);
        expect(candidate.revert).not.toHaveBeenCalled();
        expect(Saveable.save).not.toHaveBeenCalled();
    });

    it("flushes before leaving dirty editors to Theia's shutdown prompt", async () => {
        const contribution = new ModelerSecondaryWindowCloseContribution();
        const candidate = modelerWidget();
        candidate.dirty = true;
        openShouldSaveDialog.mockResolvedValue(true);
        let flushCount = 0;
        const executeCommand = vi.fn().mockImplementation(async () => {
            flushCount += 1;
            if (flushCount === 2) {
                candidate.dirty = true;
            }
            return true;
        });
        Object.assign(contribution, {
            commands: { executeCommand },
            secondaryWindowHandler: { modelerWidgets: [candidate] },
        });
        const shutdown = contribution.onWillStop({
            shell: {
                canSaveAll: vi.fn().mockReturnValue(true),
                widgets: [candidate],
            },
        } as never);
        const prepared = await shutdown?.prepare?.();
        candidate.dirty = false;

        await expect(shutdown?.action(prepared)).resolves.toBe(true);
        expect(executeCommand).toHaveBeenCalledTimes(2);
        expect(Saveable.save).toHaveBeenCalledWith(candidate);
        expect(candidate.dirty).toBe(false);
        expect(openShouldSaveDialog).toHaveBeenCalledOnce();
    });

    it("does not add a shutdown action without detached modelers", () => {
        const contribution = new ModelerSecondaryWindowCloseContribution();
        Object.assign(contribution, {
            secondaryWindowHandler: { modelerWidgets: [] },
        });

        expect(
            contribution.onWillStop({
                shell: { canSaveAll: vi.fn().mockReturnValue(false), widgets: [] },
            } as never),
        ).toBeUndefined();
    });
});
