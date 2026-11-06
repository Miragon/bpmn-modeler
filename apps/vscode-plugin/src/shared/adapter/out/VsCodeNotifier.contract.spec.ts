import { vi } from "vitest";

vi.mock("vscode", () => import("../../../__fixtures__/vscodeWindowFake"));

import { describeNotifierContract } from "@miragon/bpmn-modeler-core/testing";

import {
    ProgressLocation,
    resetVscodeWindow,
    vscodeWindow,
} from "../../../__fixtures__/vscodeWindowFake";
import { VsCodeNotifier } from "./VsCodeNotifier";

// The port promises a status-bar indicator, so a progress elsewhere does not count.
describeNotifierContract("VsCodeNotifier over the vscode window fake", async () => {
    resetVscodeWindow();
    return {
        notifier: new VsCodeNotifier(),
        showingProgress: () =>
            vscodeWindow.progressIndicators
                .filter(({ running, location }) => running && location === ProgressLocation.Window)
                .map(({ title }) => title ?? ""),
    };
});
