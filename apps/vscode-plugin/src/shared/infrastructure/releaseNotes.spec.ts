import { beforeEach, describe, expect, it, vi } from "vitest";

const showInformationMessageMock = vi.fn();
const openExternalMock = vi.fn();

vi.mock("vscode", () => ({
    window: {
        showInformationMessage: (...args: unknown[]) => showInformationMessageMock(...args),
    },
    env: { openExternal: (...args: unknown[]) => openExternalMock(...args) },
    Uri: { parse: (value: string) => ({ toString: () => value }) },
}));

import { RecordingNotifier } from "@miragon/bpmn-modeler-core/testing";

import { InMemoryMemento } from "../../__fixtures__/vscodeStorage";
import { notifyIfNewRelease } from "./releaseNotes";

let logger: RecordingNotifier;

async function stateAfterNotifying(version: string): Promise<InMemoryMemento> {
    const globalState = new InMemoryMemento();
    await notifyIfNewRelease(version, globalState, logger);
    return globalState;
}

beforeEach(() => {
    vi.clearAllMocks();
    logger = new RecordingNotifier();
    showInformationMessageMock.mockResolvedValue(undefined);
    openExternalMock.mockResolvedValue(true);
});

describe("notifyIfNewRelease", () => {
    it("announces a newly installed version and remembers it", async () => {
        const globalState = await stateAfterNotifying("1.2.3");

        expect(showInformationMessageMock).toHaveBeenCalledWith(
            "BPMN Modeler updated to v1.2.3. See what's new!",
            "View Release Notes",
        );
        expect(globalState.get("lastNotifiedVersion")).toBe("1.2.3");
    });

    it("stays silent for a version it already announced", async () => {
        const globalState = new InMemoryMemento();
        await globalState.update("lastNotifiedVersion", "1.2.3");

        await notifyIfNewRelease("1.2.3", globalState, logger);

        expect(showInformationMessageMock).not.toHaveBeenCalled();
    });

    it("remembers the version before the prompt so a dismissed or crashed prompt never repeats", async () => {
        const globalState = new InMemoryMemento();
        let rememberedWhenShown: unknown;
        showInformationMessageMock.mockImplementation(async () => {
            rememberedWhenShown = globalState.get("lastNotifiedVersion");
            return undefined;
        });

        await notifyIfNewRelease("1.2.3", globalState, logger);

        expect(rememberedWhenShown).toBe("1.2.3");
    });

    it("opens the version's release notes when asked to", async () => {
        showInformationMessageMock.mockResolvedValue("View Release Notes");

        await stateAfterNotifying("1.2.3");

        expect(openExternalMock).toHaveBeenCalledOnce();
        expect(String(openExternalMock.mock.calls[0][0])).toBe(
            "https://github.com/Miragon/bpmn-modeler/releases/tag/vscode-v1.2.3",
        );
    });

    it("opens nothing when the prompt is dismissed", async () => {
        await stateAfterNotifying("1.2.3");

        expect(openExternalMock).not.toHaveBeenCalled();
    });

    it("logs a failed write and still shows the prompt", async () => {
        const globalState = new InMemoryMemento();
        vi.spyOn(globalState, "update").mockRejectedValue(new Error("storage full"));

        await notifyIfNewRelease("1.2.3", globalState, logger);

        expect(logger.logged("error")).toEqual(["storage full"]);
        expect(showInformationMessageMock).toHaveBeenCalledOnce();
    });

    it("logs a failure to open the release notes", async () => {
        showInformationMessageMock.mockResolvedValue("View Release Notes");
        openExternalMock.mockRejectedValue("no browser");

        await stateAfterNotifying("1.2.3");

        expect(logger.logged("error")).toEqual(["no browser"]);
    });
});
