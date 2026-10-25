import { describe, expect, it } from "vitest";

import { implementationStatusKey } from "./implementation";

describe("implementationStatusKey", () => {
    it("changes with the reference so an edited reference never reuses a stale resolution", () => {
        expect(implementationStatusKey("Task_1", "com.acme.A")).not.toBe(
            implementationStatusKey("Task_1", "com.acme.B"),
        );
    });
});
