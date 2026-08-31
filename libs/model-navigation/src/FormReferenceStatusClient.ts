import { extractReference } from "./extractReference";
import type { ModelNavigationPort } from "./ModelNavigationPort";

interface EventBus {
    on(event: string, callback: (event?: unknown) => void): void;
}

interface ContextPad {
    isOpen(): boolean;
    open(target: unknown, force?: boolean): void;
}

interface Element {
    businessObject?: Parameters<typeof extractReference>[0];
}

function singleTarget(current: unknown): Element | undefined {
    const target = (current as { target?: unknown } | undefined)?.target;
    return target && !Array.isArray(target) ? (target as Element) : undefined;
}

/** Caches host-resolvable form ids for the context-pad provider. */
export class FormReferenceStatusClient {
    static $inject = ["eventBus", "contextPad", "modelNavigationPort"];

    private currentPadTarget: Element | undefined;

    constructor(
        eventBus: EventBus,
        private readonly contextPad: ContextPad,
        private readonly modelNavigationPort: ModelNavigationPort,
    ) {
        eventBus.on("contextPad.open", (event) => {
            this.currentPadTarget = singleTarget((event as { current?: unknown })?.current);
        });
        eventBus.on("contextPad.close", () => {
            this.currentPadTarget = undefined;
        });

        const unsubscribe = modelNavigationPort.onReferenceAvailabilityChanged?.(() =>
            this.refreshContextPad(),
        );
        if (unsubscribe) {
            eventBus.on("diagram.destroy", unsubscribe);
        }
    }

    isResolved(formId: string): boolean {
        return (
            this.modelNavigationPort.isReferenceAvailable?.({ id: formId, kind: "form" }) ?? true
        );
    }

    private refreshContextPad(): void {
        const target = this.currentPadTarget;
        if (
            target &&
            extractReference(target.businessObject, "form") !== undefined &&
            this.contextPad.isOpen()
        ) {
            this.contextPad.open(target, true);
        }
    }
}
