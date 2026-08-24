import { extractReference } from "./extractReference";

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
    static $inject = ["eventBus", "contextPad"];

    private formIds = new Set<string>();
    private currentPadTarget: Element | undefined;

    constructor(
        eventBus: EventBus,
        private readonly contextPad: ContextPad,
    ) {
        eventBus.on("contextPad.open", (event) => {
            this.currentPadTarget = singleTarget((event as { current?: unknown })?.current);
        });
        eventBus.on("contextPad.close", () => {
            this.currentPadTarget = undefined;
        });
    }

    applyStatus(formIds: string[]): void {
        const previous = this.formIds;
        const next = new Set(formIds);
        const target = this.currentPadTarget;
        const changed =
            target !== undefined && this.lookup(previous, target) !== this.lookup(next, target);
        this.formIds = next;

        if (changed && target && this.contextPad.isOpen()) {
            this.contextPad.open(target, true);
        }
    }

    isResolved(formId: string): boolean {
        return this.formIds.has(formId);
    }

    private lookup(ids: Set<string>, element: Element): boolean {
        const formId = extractReference(element.businessObject, "form");
        return formId !== undefined && ids.has(formId);
    }
}
