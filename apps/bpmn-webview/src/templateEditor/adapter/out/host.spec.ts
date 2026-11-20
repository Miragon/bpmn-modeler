import { afterEach, describe, expect, it, vi } from "vitest";

import { HostApiImpl } from "@miragon/bpmn-modeler-shared";

import { PreviewHost } from "./browserPreview/previewHost";
import { getTemplateEditorHostApi } from "./host";

afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

describe("getTemplateEditorHostApi", () => {
    it("talks to the real host outside development", () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubGlobal("acquireVsCodeApi", () => ({ postMessage: vi.fn() }));

        expect(getTemplateEditorHostApi()).toBeInstanceOf(HostApiImpl);
    });

    it("serves the browser preview's host in development", () => {
        vi.stubEnv("NODE_ENV", "development");

        expect(getTemplateEditorHostApi()).toBeInstanceOf(PreviewHost);
    });
});
