import { vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { ActionNotice, ActionNoticeTone } from "@miragon/bpmn-modeler-core";
import { describeActionNotifierContract } from "@miragon/bpmn-modeler-core/testing";

import {
    FakeToast,
    resetVscodeWindow,
    ToastSeverity,
    vscodeWindow,
} from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeActionNotifier } from "./VsCodeActionNotifier";

const TONE_OF: Partial<Record<ToastSeverity, ActionNoticeTone>> = {
    information: "info",
    warning: "warning",
};

describeActionNotifierContract("VsCodeActionNotifier over the vscode window fake", async () => {
    resetVscodeWindow();
    const adapter = new VsCodeActionNotifier();
    let settle: (toast: FakeToast) => void = (toast) => toast.close();
    return {
        // Plays the user on the toast the adapter just showed.
        notifier: {
            offer: <V>(notice: ActionNotice<V>) => {
                const offered = adapter.offer(notice);
                const toast = vscodeWindow.toasts.at(-1);
                if (toast) settle(toast);
                return offered;
            },
        },
        userClicks: (_notice, index) => {
            settle = (toast) => toast.clickAt(index);
        },
        userCloses: () => {
            settle = (toast) => toast.close();
        },
        lastShown: () => {
            const toast = vscodeWindow.toasts.at(-1);
            const tone = toast && TONE_OF[toast.severity];
            return (
                toast &&
                tone && { tone, message: toast.message, labels: toast.labels }
            );
        },
    };
});
