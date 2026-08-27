/**
 * bpmn-js DI service that keeps the host's activity→code map in sync with the
 * live diagram and caches the resolution status the context-pad provider reads
 * to decide whether to show the "Go to implementation" entry.
 *
 * It is the webview half of the always-on map: on import and after edits it
 * ships the diagram's implementation references to the host
 * ({@link CodeLinkPort.syncActivities}); the host resolves the delta and pushes
 * back a `key → resolved` lookup consumed by {@link applyStatus}. The provider
 * then calls {@link isResolved} per element.
 *
 * It never mutates bpmn-js model state — forcing the context pad to re-render
 * does not run the command stack — so a status push can't loop back into a
 * `commandStack.changed` event and re-trigger a sync.
 */
import { implementationStatusKey } from "@miragon/bpmn-modeler-types";
import type { ImplementationEntry } from "@miragon/bpmn-modeler-types";

import { collectImplementations, ElementRegistryLike } from "./collectImplementations";
import { extractImplementation } from "./extractImplementation";
import type { Element } from "./CodeLinkContextPadProvider";
import type { CodeLinkPort } from "./CodeLinkPort";

interface EventBus {
    on(event: string, callback: (event?: unknown) => void): void;
}

interface ContextPad {
    isOpen(): boolean;
    open(target: unknown, force?: boolean): void;
}

// Coalesce the bursts of `commandStack.changed` a single gesture fires (drag,
// multi-property edit) into one sync. import.done bypasses this — the first
// status push should land as fast as possible for a flash-free open.
const SYNC_DEBOUNCE_MS = 400;

/**
 * The context pad opens for a single element or a multi-selection array; we only
 * track single-element targets because the "Go to implementation" entry never
 * appears for a multi-selection, so there is nothing to refresh for arrays.
 */
function singleTarget(current: unknown): Element | undefined {
    const target = (current as { target?: unknown } | undefined)?.target;
    if (!target || Array.isArray(target)) {
        return undefined;
    }
    return target as Element;
}

export class CodeLinkMapClient {
    static $inject = ["eventBus", "elementRegistry", "contextPad", "codeLinkPort"];

    private readonly elementRegistry: ElementRegistryLike;

    private readonly contextPad: ContextPad;

    private readonly port: CodeLinkPort;

    // Resolution status keyed by `${activityId}::${reference}`. Absent key ⇒
    // unknown ⇒ shown optimistically; explicit `false` ⇒ hidden.
    private statusByKey: Map<string, boolean> = new Map();

    // Signature of the last entry list sent, so an edit that touches no
    // implementation binding (moving a shape, renaming a flow) is not re-sent.
    private lastSentSignature: string | undefined;

    // The element the context pad is currently open for, so a status flip while
    // it is open can re-render it (drop a now-stale entry / surface a new one).
    private currentPadTarget: Element | undefined;

    private syncTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        eventBus: EventBus,
        elementRegistry: ElementRegistryLike,
        contextPad: ContextPad,
        codeLinkPort: CodeLinkPort,
    ) {
        this.elementRegistry = elementRegistry;
        this.contextPad = contextPad;
        this.port = codeLinkPort;

        eventBus.on("import.done", () => this.sendNow());
        eventBus.on("commandStack.changed", () => this.sendDebounced());
        eventBus.on("contextPad.open", (event) => {
            this.currentPadTarget = singleTarget((event as { current?: unknown })?.current);
        });
        eventBus.on("contextPad.close", () => {
            this.currentPadTarget = undefined;
        });
    }

    /**
     * Applies a host status push: replaces the cache with the new snapshot and,
     * if the context pad is open for an element whose visibility just flipped,
     * re-renders it so a now-resolved entry appears or a now-broken one hides
     * without waiting for the user to reselect.
     */
    applyStatus(resolved: Record<string, boolean>): void {
        const previous = this.statusByKey;
        const next = new Map(Object.entries(resolved));
        const target = this.currentPadTarget;
        const flipped =
            target !== undefined && this.lookup(previous, target) !== this.lookup(next, target);

        this.statusByKey = next;

        if (flipped && target && this.contextPad.isOpen()) {
            this.contextPad.open(target, true);
        }
    }

    /**
     * Visibility decision for the provider. Unknown (no push seen for this
     * activity/reference yet) is optimistic `true`; only a cached `false` hides.
     */
    isResolved(element: Element): boolean {
        return this.lookup(this.statusByKey, element);
    }

    private lookup(status: Map<string, boolean>, element: Element): boolean {
        const implementation = extractImplementation(element.businessObject);
        if (!element.id || !implementation) {
            return true;
        }
        const cached = status.get(implementationStatusKey(element.id, implementation.reference));
        return cached === undefined ? true : cached;
    }

    private sendDebounced(): void {
        if (this.syncTimer !== undefined) {
            clearTimeout(this.syncTimer);
        }
        this.syncTimer = setTimeout(() => {
            this.syncTimer = undefined;
            this.sendNow();
        }, SYNC_DEBOUNCE_MS);
    }

    private sendNow(): void {
        const entries: ImplementationEntry[] = collectImplementations(this.elementRegistry);
        const signature = JSON.stringify(entries);
        if (signature === this.lastSentSignature) {
            return;
        }
        this.lastSentSignature = signature;
        this.port.syncActivities(entries);
    }
}
