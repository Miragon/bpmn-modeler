import { describe, expect, it } from "vitest";
import TransactionBoundariesModule from "camunda-transaction-boundaries/lib/index.js";

import { transactionBoundaries } from "./transactionBoundariesFeature";
import { TransactionBoundaryVisibilityModule } from "./TransactionBoundaryVisibility";

describe("transactionBoundaries", () => {
    it("registers the marks, then their visibility", async () => {
        expect(await transactionBoundaries()).toEqual({
            id: "transactionBoundaries",
            modules: [TransactionBoundariesModule, TransactionBoundaryVisibilityModule],
        });
    });
});
