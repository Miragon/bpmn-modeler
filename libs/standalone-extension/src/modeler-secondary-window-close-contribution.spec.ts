import { describe, expect, it, vi } from "vitest";

vi.mock("@theia/core/lib/browser/secondary-window-handler", () => ({
    SecondaryWindowHandler: class {},
    getAllWidgetsFromSecondaryWindow: (secondaryWindow: Window & { widgets?: unknown[] }) =>
        secondaryWindow.widgets,
}));

import { ModelerSecondaryWindowCloseContribution } from "./modeler-secondary-window-close-contribution";

function widget(closable = true) {
    return {
        close: vi.fn(),
        title: { closable },
    };
}

describe("ModelerSecondaryWindowCloseContribution", () => {
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
});
