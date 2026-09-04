import type { ModelReference } from "@miragon/bpmn-modeler";
import { modelHref, resolveReference } from "./registry";

/**
 * The demo's `modelNavigation.openReference` port, shared by every BPMN surface
 * (viewer / design / modeler). Resolves a context-pad reference against the
 * model registry and swaps the page to the target; an unresolvable reference
 * (e.g. a `form`, which the demo does not host) is a silent no-op.
 */
export function openReference({ id, kind }: ModelReference): void {
    const target = resolveReference(id, kind);
    if (target) {
        window.location.href = modelHref(target);
    }
}
