/**
 * Ambient type declaration for `bpmn-moddle`.  The published package ships
 * without `.d.ts` files, and we only consume a few surfaces — the factory, the
 * shape of `fromXML`'s result, and `toXML` — so a minimal shim is enough.
 *
 * The real package exports `SimpleBpmnModdle` under the name `BpmnModdle`
 * (ESM named export) and has no `default` export.  Consumers call it as a
 * plain function, not with `new`.  We also declare `default` here so callers
 * that go through a bundler's ESM→CJS interop can still compile — at runtime
 * they must tolerate `default` being `undefined`.
 */
declare module "bpmn-moddle" {
    /** A parsed moddle element; only `$type` is guaranteed, rest is open. */
    interface ModdleElement {
        $type: string;
        [key: string]: unknown;
    }

    interface ParseResult {
        rootElement: ModdleElement;
        // Index of every element carrying an `id`, keyed by that id — the
        // fast path for addressing a script's host element without walking
        // the tree.
        elementsById: Record<string, ModdleElement>;
        references: unknown[];
        warnings: unknown[];
    }

    interface SerializeResult {
        xml: string;
    }

    interface BpmnModdleInstance {
        fromXML(xml: string): Promise<ParseResult>;
        toXML(element: ModdleElement, options?: { format?: boolean }): Promise<SerializeResult>;
    }

    type BpmnModdleFactory = (
        additionalPackages?: Record<string, unknown>,
        options?: unknown,
    ) => BpmnModdleInstance;

    export const BpmnModdle: BpmnModdleFactory;

    const _default: BpmnModdleFactory | undefined;
    export default _default;
}
