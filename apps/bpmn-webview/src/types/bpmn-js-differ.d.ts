/**
 * Ambient type declarations for `bpmn-js-differ`, which ships without its own
 * `.d.ts`.  The dev-only `MockedVsCodeApi` runs the differ in the browser to
 * preview the diff UI; outside of dev the library is dead-code-eliminated.
 */
declare module "bpmn-js-differ" {
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

    export function diff(before: ModdleElement, after: ModdleElement): DiffResult;
}
