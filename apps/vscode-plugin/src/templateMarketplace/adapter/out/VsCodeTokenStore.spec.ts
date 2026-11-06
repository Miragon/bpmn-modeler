import { beforeEach, describe, expect, it, vi } from "vitest";

import { describeTokenStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { InMemorySecretStorage } from "../../../__fixtures__/vscodeStorage";

// The store reaches secret storage only through `getContext().secrets`.
let secrets = new InMemorySecretStorage();
vi.mock("../../../shared/adapter/out/extensionContext", () => ({
    getContext: () => ({ secrets }),
}));

import { VsCodeTokenStore } from "./VsCodeTokenStore";

beforeEach(() => {
    secrets = new InMemorySecretStorage();
});

describeTokenStoreContract("VsCodeTokenStore", async () => new VsCodeTokenStore());

describe("VsCodeTokenStore", () => {
    it("reads a token under the per-host key scheme", async () => {
        await secrets.store("bpmn-modeler.marketplace.token.github.com", "tok");

        await expect(new VsCodeTokenStore().getToken("github.com")).resolves.toBe("tok");
    });

    it("stores a token under the per-host key scheme", async () => {
        await new VsCodeTokenStore().setToken("github.com", "tok");

        expect([...secrets.entries]).toEqual([
            ["bpmn-modeler.marketplace.token.github.com", "tok"],
        ]);
    });
});
