import { TRANSACTION_BOUNDARY_VISIBILITY } from "../../domain/transactionBoundaryNames";

// Below every default import.done listener and bpmn-js-bpmnlint's 500: the facade
// re-showed the marks after the import resolved, so after all of those.
const TRANSACTION_BOUNDARY_RESHOW_PRIORITY = 300;

// Structural sliver of camunda-transaction-boundaries' service: the members called here.
interface TransactionBoundariesService {
    readonly active: boolean;
    show(): void;
    hide(): void;
}

interface ImportDoneEventBus {
    on(
        event: "import.done",
        priority: number,
        listener: (event: { error?: unknown }) => void,
    ): void;
}

/**
 * Keeps the transaction-boundary marks in step with the setting. An import
 * clears the overlays, so every successful import re-shows them; bpmn-js fires
 * `import.done` on a failed import too, which keeps the previous diagram.
 */
export class TransactionBoundaryVisibility {
    static $inject = ["eventBus", "transactionBoundaries"];

    private visible = true;

    private diagramImported = false;

    constructor(
        eventBus: ImportDoneEventBus,
        private readonly transactionBoundaries: TransactionBoundariesService,
    ) {
        eventBus.on("import.done", TRANSACTION_BOUNDARY_RESHOW_PRIORITY, (event) => {
            if (event.error) {
                return;
            }
            this.diagramImported = true;
            if (this.visible) {
                this.transactionBoundaries.show();
            }
        });
    }

    /** Before the first import it only keeps the setting; upstream `show()` is not idempotent. */
    setVisible(visible: boolean): void {
        this.visible = visible;
        if (!this.diagramImported || visible === this.transactionBoundaries.active) {
            return;
        }
        if (visible) {
            this.transactionBoundaries.show();
        } else {
            this.transactionBoundaries.hide();
        }
    }
}

export const TransactionBoundaryVisibilityModule = {
    __init__: [TRANSACTION_BOUNDARY_VISIBILITY],
    [TRANSACTION_BOUNDARY_VISIBILITY]: ["type", TransactionBoundaryVisibility],
};
