/**
 * Ambient type declarations for `bpmn-js-differ`, which ships without its own
 * `.d.ts`.  Covers only the subset used by the BPMN diff feature — `diff()`
 * and the shape of its return value.
 */
declare module "bpmn-js-differ" {
    /**
     * A bpmn-moddle element reference — opaque here because the differ only
     * consumes objects produced by `bpmn-moddle` and we never inspect them
     * beyond reading `$type` and `id`.
     */
    interface ModdleElement {
        $type: string;
        id?: string;
        [key: string]: unknown;
    }

    interface ChangedEntry {
        model: ModdleElement;
        attrs: Record<string, { oldValue: unknown; newValue: unknown }>;
    }

    interface DiffResult {
        _added: Record<string, ModdleElement>;
        _removed: Record<string, ModdleElement>;
        _changed: Record<string, ChangedEntry>;
        _layoutChanged: Record<string, ModdleElement>;
    }

    export function diff(
        before: ModdleElement,
        after: ModdleElement,
    ): DiffResult;
}
