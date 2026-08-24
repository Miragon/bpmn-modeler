import { StopReason } from "@theia/core/lib/common/frontend-application-state";
import * as dialogs from "@theia/core/lib/browser/dialogs";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
    Object.defineProperty(globalThis, "DragEvent", {
        configurable: true,
        value: class extends Event {},
    });
});

vi.mock("@theia/core/lib/browser/widget-manager", () => ({
    WidgetManager: class {},
}));

import { ModelerWindowService } from "./modeler-window-service";

const confirmExit = vi.spyOn(dialogs, "confirmExit").mockResolvedValue(true);

function modelerWidget(live = true) {
    return {
        element: live ? {} : undefined,
        id: "modeler",
        isDisposed: false,
        node: { inert: false },
        resource: { toString: () => "file:///process.bpmn" },
        title: { closable: true },
        viewType: "bpmn-modeler.bpmn",
    };
}

function setup(
    confirmExitPreference: "always" | "ifRequired" | "never",
    widgets = [modelerWidget()],
    contributions: unknown[] = [],
) {
    const executeCommand = vi.fn().mockResolvedValue(true);
    const app = {
        shell: {
            canSaveAll: vi.fn().mockReturnValue(false),
            widgets,
        },
    };
    const service = new ModelerWindowService();
    Object.assign(service, {
        commands: { executeCommand },
        contributions: { getContributions: () => contributions },
        corePreferences: { "application.confirmExit": confirmExitPreference },
        frontendApplication: app,
        logger: { debug: vi.fn(), error: vi.fn() },
        widgetManager: { getWidgets: vi.fn().mockReturnValue(widgets) },
    });
    return { app, executeCommand, service };
}

describe("ModelerWindowService", () => {
    afterEach(() => {
        confirmExit.mockClear();
    });

    it("flushes modelers even when exit confirmation is disabled", async () => {
        const { executeCommand, service } = setup("never");

        await expect(service.isSafeToShutDown(StopReason.Close)).resolves.toBe(true);

        expect(executeCommand).toHaveBeenCalledOnce();
    });

    it("vetoes shutdown before Theia prompts when a modeler cannot be flushed", async () => {
        const builtInOnWillStop = vi.fn();
        const { executeCommand, service } = setup("ifRequired", undefined, [
            { onWillStop: builtInOnWillStop },
        ]);
        executeCommand.mockResolvedValue(false);

        await expect(service.isSafeToShutDown(StopReason.Close)).resolves.toBe(false);

        expect(builtInOnWillStop).not.toHaveBeenCalled();
    });

    it("leaves dirty-editor confirmation to Theia after flushing", async () => {
        const decide = vi.fn().mockResolvedValue(true);
        const builtInOnWillStop = vi.fn().mockReturnValue({
            reason: "Dirty editors present",
            action: decide,
        });
        const { executeCommand, service } = setup("ifRequired", undefined, [
            { onWillStop: builtInOnWillStop },
        ]);

        await expect(service.isSafeToShutDown(StopReason.Close)).resolves.toBe(true);

        expect(executeCommand).toHaveBeenCalledOnce();
        expect(builtInOnWillStop).toHaveBeenCalledOnce();
        expect(decide).toHaveBeenCalledOnce();
    });

    it("keeps modelers quiesced until Theia's shutdown decision settles", async () => {
        let finishDecision: (result: boolean) => void = () => undefined;
        const candidate = modelerWidget();
        const decide = vi.fn(
            () =>
                new Promise<boolean>((resolve) => {
                    finishDecision = resolve;
                }),
        );
        const { service } = setup(
            "ifRequired",
            [candidate],
            [
                {
                    onWillStop: () => ({ reason: "Dirty editors present", action: decide }),
                },
            ],
        );

        const shuttingDown = service.isSafeToShutDown(StopReason.Close);
        await vi.waitFor(() => expect(decide).toHaveBeenCalledOnce());
        expect(candidate.node.inert).toBe(true);
        finishDecision(true);

        await expect(shuttingDown).resolves.toBe(true);
        expect(candidate.node.inert).toBe(false);
    });

    it("honors always-confirm with a clean modeler open", async () => {
        const candidate = modelerWidget();
        const { service } = setup("always", [candidate]);

        await expect(service.isSafeToShutDown(StopReason.Close)).resolves.toBe(true);

        expect(confirmExit).toHaveBeenCalledOnce();
    });

    it("skips hidden modeler webviews whose host buffers are authoritative", async () => {
        const { executeCommand, service } = setup("never", [modelerWidget(false)]);

        await expect(service.isSafeToShutDown(StopReason.Close)).resolves.toBe(true);

        expect(executeCommand).not.toHaveBeenCalled();
    });
});
