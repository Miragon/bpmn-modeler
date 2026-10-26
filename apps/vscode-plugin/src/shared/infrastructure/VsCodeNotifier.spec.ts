import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("../../__fixtures__/vscodeWindowFake"));

import {
    ProgressLocation,
    renderedToasts,
    resetVscodeWindow,
    Uri,
    vscodeWindow,
} from "../../__fixtures__/vscodeWindowFake";
import { VsCodeNotifier } from "./VsCodeNotifier";

let notifier: VsCodeNotifier;

beforeEach(() => {
    resetVscodeWindow();
    notifier = new VsCodeNotifier();
});

function logChannel() {
    const [channel] = vscodeWindow.outputChannels;
    return channel;
}

describe("VsCodeNotifier toasts", () => {
    it("shows information as an information toast without actions", () => {
        notifier.showInfo("Deployed order.bpmn to dev.");

        expect(renderedToasts()).toEqual([
            { severity: "information", message: "Deployed order.bpmn to dev.", actions: [] },
        ]);
    });

    it("shows an error as an error toast without actions", () => {
        notifier.showError("No deployment target is configured.");

        expect(renderedToasts()).toEqual([
            { severity: "error", message: "No deployment target is configured.", actions: [] },
        ]);
    });

    it("pairs what failed with the error's message and logs the context with the stack, as the bridge does", () => {
        const failure = new Error("401 Unauthorized");
        failure.stack = "Error: 401 Unauthorized\n    at deploy (DeploymentService.ts:42:7)";

        notifier.notifyError("Deploying order.bpmn failed", failure);

        expect(renderedToasts()).toEqual([
            {
                severity: "error",
                message: "Deploying order.bpmn failed\n401 Unauthorized",
                actions: [],
            },
        ]);
        expect(logChannel().lines).toEqual([
            {
                level: "error",
                entry: "Deploying order.bpmn failed: Error: 401 Unauthorized\n    at deploy (DeploymentService.ts:42:7)",
            },
        ]);
    });

    it("shows a thrown value that is not an Error as it is", () => {
        notifier.notifyError("Reading the element templates failed", "EACCES" as unknown as Error);

        expect(renderedToasts().map((toast) => toast.message)).toEqual([
            "Reading the element templates failed\nEACCES",
        ]);
        expect(logChannel().lines).toEqual([{ level: "error", entry: "EACCES" }]);
    });

    it("reloads the window when the user picks the toast's reload action", async () => {
        const shown = notifier.showErrorWithReload("Reload the window to use the new setting.");

        expect(renderedToasts()).toEqual([
            {
                severity: "error",
                message: "Reload the window to use the new setting.",
                actions: ["Reload Window"],
            },
        ]);
        vscodeWindow.toasts[0].click("Reload Window");
        await shown;

        expect(vscodeWindow.executedCommands).toEqual([
            { command: "workbench.action.reloadWindow", args: [] },
        ]);
    });

    it("leaves the window alone when the reload toast is dismissed", async () => {
        const shown = notifier.showErrorWithReload("Reload the window to use the new setting.");

        vscodeWindow.toasts[0].close();
        await shown;

        expect(vscodeWindow.executedCommands).toEqual([]);
    });
});

describe("VsCodeNotifier log", () => {
    it("writes to a single log channel named bpmn.modeler", () => {
        expect(
            vscodeWindow.outputChannels.map(({ name, isLogChannel }) => ({ name, isLogChannel })),
        ).toEqual([{ name: "bpmn.modeler", isLogChannel: true }]);
    });

    it("writes each message at its own log level", () => {
        const failure = new Error("Template folder vanished");
        const webviewStack = "TypeError: x is undefined\n    at index.js:1:1";

        notifier.logDebug("Message received -> GetBpmnFileCommand");
        notifier.logInfo("Loaded 3 element templates");
        notifier.logWarning("No .bpmnlintrc found");
        notifier.logError(webviewStack);
        notifier.logError(failure);

        expect(logChannel().lines).toEqual([
            { level: "debug", entry: "Message received -> GetBpmnFileCommand" },
            { level: "info", entry: "Loaded 3 element templates" },
            { level: "warning", entry: "No .bpmnlintrc found" },
            { level: "error", entry: webviewStack },
            { level: "error", entry: failure },
        ]);
        expect(logChannel().lines[4].entry).toBe(failure);
    });

    it("reveals the log without taking the focus from the editor", () => {
        notifier.openLoggingConsole();

        expect(logChannel().revealed).toEqual({ preserveFocus: true });
    });
});

describe("VsCodeNotifier progress", () => {
    it("shows a status bar progress indicator while the task runs", async () => {
        let finishDeploy: (outcome: string) => void = () => undefined;
        const deploy = new Promise<string>((resolve) => (finishDeploy = resolve));

        const result = notifier.withProgress("Deploying order.bpmn", () => deploy);

        expect(vscodeWindow.progressIndicators).toEqual([
            { location: ProgressLocation.Window, title: "Deploying order.bpmn", running: true },
        ]);
        finishDeploy("deployed");
        await expect(result).resolves.toBe("deployed");
        expect(vscodeWindow.progressIndicators.map((indicator) => indicator.running)).toEqual([
            false,
        ]);
    });

    it("hands a failed task's error back to the caller", async () => {
        const failure = new Error("Engine unreachable");

        await expect(
            notifier.withProgress("Deploying order.bpmn", () => Promise.reject(failure)),
        ).rejects.toBe(failure);
        expect(vscodeWindow.progressIndicators.map((indicator) => indicator.running)).toEqual([
            false,
        ]);
    });
});

describe("VsCodeNotifier.openDocument", () => {
    it("opens the file in its registered editor as a persistent tab", async () => {
        await notifier.openDocument("/repo/src/Worker.java");

        expect(vscodeWindow.executedCommands).toEqual([
            {
                command: "vscode.open",
                args: [Uri.file("/repo/src/Worker.java"), { preview: false }],
            },
        ]);
    });
});
