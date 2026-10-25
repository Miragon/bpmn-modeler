import { describe, expect, it } from "vitest";

import { LogInfoCommand, ShowInfoCommand } from "@miragon/bpmn-modeler-shared";

import { RecordingNotifier } from "../../testing";
import { WebviewMessageRouter } from "./WebviewMessageRouter";
import { registerWebviewNotificationHandlers } from "./webviewNotificationHandlers";

const EDITOR = "file:///w/a.bpmn";

function setup() {
    const notifier = new RecordingNotifier();
    const router = new WebviewMessageRouter();
    registerWebviewNotificationHandlers(router, notifier);
    return { notifier, router };
}

describe("registerWebviewNotificationHandlers", () => {
    it("surfaces a ShowInfoCommand via the notifier", async () => {
        const { notifier, router } = setup();

        await router.dispatch(new ShowInfoCommand("templates rejected"), EDITOR);

        expect(notifier.infos).toEqual(["templates rejected"]);
    });

    it("does not notify for a log command", async () => {
        const { notifier, router } = setup();

        await router.dispatch(new LogInfoCommand("i"), EDITOR);

        expect(notifier.infos).toEqual([]);
    });
});
