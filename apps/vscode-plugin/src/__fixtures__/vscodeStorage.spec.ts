import { describe, expect, it } from "vitest";

import { InMemoryMemento } from "./vscodeStorage";

describe("InMemoryMemento", () => {
    it("forgets a key updated to undefined, as VS Code's Memento does", async () => {
        const memento = new InMemoryMemento();
        await memento.update("kept", 1);
        await memento.update("cleared", "value");

        await memento.update("cleared", undefined);

        expect(memento.keys()).toEqual(["kept"]);
        expect(memento.get("cleared", "fallback")).toBe("fallback");
    });
});
