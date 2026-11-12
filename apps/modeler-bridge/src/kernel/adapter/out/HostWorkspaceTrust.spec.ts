import { describe, expect, it } from "vitest";

import { HostWorkspaceTrust } from "./HostWorkspaceTrust";

describe("HostWorkspaceTrust", () => {
    it("keeps the newest snapshot when an older one is applied after it", () => {
        const trust = new HostWorkspaceTrust();
        let changes = 0;
        trust.onDidChange(() => changes++);

        trust.apply({ trusted: true, revision: 3 });
        trust.apply({ trusted: false, revision: 2 });

        expect(trust.isTrusted()).toBe(true);
        expect(changes).toBe(1);
    });

    it("takes a respawned bridge's first snapshot whatever revision the host counted to", () => {
        const trust = new HostWorkspaceTrust();

        trust.apply({ trusted: true, revision: 41 });

        expect(trust.isTrusted()).toBe(true);
    });
});
