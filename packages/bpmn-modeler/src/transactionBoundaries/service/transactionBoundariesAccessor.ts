import type { EditingSurface } from "../../kernel/port/bpmnSurface";
import { TRANSACTION_BOUNDARY_VISIBILITY } from "../domain/transactionBoundaryNames";

interface VisibilityInjector {
    get<T>(name: string, strict: false): T | null;
}

/** @experimental What a host calls on a surface's transaction-boundary feature. */
export interface TransactionBoundariesAccessor {
    setVisible(visible: boolean): void;
}

/** @experimental `undefined` on a surface built without transaction boundaries (any C8 one). */
export function transactionBoundariesOf(
    surface: Pick<EditingSurface, "getService">,
): TransactionBoundariesAccessor | undefined {
    const visibility = surface
        .getService<VisibilityInjector>("injector")
        .get<TransactionBoundariesAccessor>(TRANSACTION_BOUNDARY_VISIBILITY, false);
    if (!visibility) {
        return undefined;
    }
    return {
        setVisible: (visible) => {
            visibility.setVisible(visible);
        },
    };
}
