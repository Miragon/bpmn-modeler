import { beforeEach, describe, expect, it, vi } from "vitest";

// The store reaches secret storage only through `getContext().secrets`; mock the
// accessor so the key scheme and round-trip are observable without VS Code.
const secrets = { get: vi.fn(), store: vi.fn() };
vi.mock("../../shared/infrastructure/extensionContext", () => ({
    getContext: vi.fn(() => ({ secrets })),
}));

import { VsCodeTokenStore } from "./VsCodeTokenStore";

beforeEach(() => {
    vi.clearAllMocks();
});

describe("VsCodeTokenStore", () => {
    it("reads a token under the per-host key scheme", async () => {
        secrets.get.mockResolvedValue("tok");

        expect(await new VsCodeTokenStore().getToken("github.com")).toBe("tok");
        expect(secrets.get).toHaveBeenCalledWith("bpmn-modeler.marketplace.token.github.com");
    });

    it("stores a token under the per-host key scheme", async () => {
        await new VsCodeTokenStore().setToken("github.com", "tok");

        expect(secrets.store).toHaveBeenCalledWith(
            "bpmn-modeler.marketplace.token.github.com",
            "tok",
        );
    });

    it("round-trips get after set through the secret store", async () => {
        const backing = new Map<string, string>();
        secrets.store.mockImplementation(async (key: string, value: string) => {
            backing.set(key, value);
        });
        secrets.get.mockImplementation(async (key: string) => backing.get(key));

        const store = new VsCodeTokenStore();
        await store.setToken("github.com", "round-trip");
        expect(await store.getToken("github.com")).toBe("round-trip");
    });

    it("scopes keys by host so two origins never collide", async () => {
        const store = new VsCodeTokenStore();
        await store.setToken("github.com", "a");
        await store.setToken("gitlab.com", "b");

        expect(secrets.store).toHaveBeenCalledWith(
            "bpmn-modeler.marketplace.token.github.com",
            "a",
        );
        expect(secrets.store).toHaveBeenCalledWith(
            "bpmn-modeler.marketplace.token.gitlab.com",
            "b",
        );
    });
});
