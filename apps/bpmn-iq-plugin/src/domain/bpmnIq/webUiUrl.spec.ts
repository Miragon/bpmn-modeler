import { describe, expect, it } from "vitest";

import { buildWebUiUrl } from "./webUiUrl";

describe("buildWebUiUrl", () => {
    it("maps fly.io daemon hosts to their sibling web app", () => {
        expect(buildWebUiUrl("https://example-server.fly.dev")).toBe(
            "https://example-web.fly.dev",
        );
    });

    it("maps localhost daemon to the Vite default port", () => {
        expect(buildWebUiUrl("http://localhost:4000")).toBe("http://localhost:5173");
    });

    it("appends the workspaceId as a deep-link query param", () => {
        expect(buildWebUiUrl("http://localhost:4000", "ws-123")).toBe(
            "http://localhost:5173/?ws=ws-123",
        );
        expect(buildWebUiUrl("https://example-server.fly.dev", "abc def")).toBe(
            "https://example-web.fly.dev/?ws=abc%20def",
        );
    });
});
