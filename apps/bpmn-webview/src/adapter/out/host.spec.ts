import { afterEach, describe, expect, it, vi } from "vitest";

import { GetBpmnFileCommand, HostApiImpl } from "@miragon/bpmn-modeler-shared";

import { getHostApi } from "./host";
import { PreviewHost } from "./browserPreview/previewHost";

describe("getHostApi", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("serves the in-browser mock only to the development preview", () => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
        vi.stubEnv("NODE_ENV", "development");

        const host = getHostApi();

        expect(host).toBeInstanceOf(PreviewHost);
        expect(host).not.toBeInstanceOf(HostApiImpl);
    });

    it("talks to the embedding host in every other build", () => {
        vi.stubEnv("NODE_ENV", "production");
        const vsCodeApi = { getState: vi.fn(), setState: vi.fn(), postMessage: vi.fn() };
        vi.stubGlobal("acquireVsCodeApi", () => vsCodeApi);
        const command = new GetBpmnFileCommand();

        const host = getHostApi();
        host.postMessage(command);

        expect(host).toBeInstanceOf(HostApiImpl);
        expect(vsCodeApi.postMessage).toHaveBeenCalledWith(command);
    });
});
