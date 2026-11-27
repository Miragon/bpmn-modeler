import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import { TransactionBoundaryVisibilityModule } from "./TransactionBoundaryVisibility";

/**
 * @experimental C7 only: marks where a transaction ends. Loaded on demand, so a
 * page only parses it on the engine that shows it.
 */
export async function transactionBoundaries(): Promise<BpmnFeature> {
    // The CJS entry wraps the ESM module in a default export, preventing DI registration under Vite.
    const { default: TransactionBoundariesModule } =
        await import("camunda-transaction-boundaries/lib/index.js");
    return {
        id: "transactionBoundaries",
        modules: [TransactionBoundariesModule, TransactionBoundaryVisibilityModule],
    };
}
