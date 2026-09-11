import { describe, expect, it, vi } from "vitest";

import { LogInfoCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { NotifierPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";
import { registerWebviewNotificationHandlers } from "./webviewNotificationHandlers";

const EDITOR = "file:///w/a.bpmn";

function setup() {
    const notifier = { showInfo: vi.fn() };
    const router = new WebviewMessageRouter();
    registerWebviewNotificationHandlers(router, notifier as unknown as NotifierPort);
    return { notifier, router };
}

describe("registerWebviewNotificationHandlers", () => {
    it("surfaces a ShowInfoCommand via the notifier", async () => {
        const { notifier, router } = setup();

        await router.dispatch(new ShowInfoCommand("templates rejected"), EDITOR);

        expect(notifier.showInfo).toHaveBeenCalledWith("templates rejected");
    });

    it("does not notify for a log command", async () => {
        const { notifier, router } = setup();

        await router.dispatch(new LogInfoCommand("i"), EDITOR);

        expect(notifier.showInfo).not.toHaveBeenCalled();
    });
});
