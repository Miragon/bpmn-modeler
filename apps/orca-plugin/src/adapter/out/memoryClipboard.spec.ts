import { expect, it } from "vitest";

import { memoryClipboard } from "./memoryClipboard";

it("hands back what was copied last within the frame", async () => {
    const clipboard = memoryClipboard();
    expect(await clipboard.requestClipboard()).toBe("");
    await clipboard.writeClipboard("first");
    await clipboard.writeClipboard("second");
    expect(await clipboard.requestClipboard()).toBe("second");
});
