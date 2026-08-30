/**
 * Ambient type declaration for `bpmn-moddle`.  The published package ships
 * without `.d.ts` files, and we only consume two surfaces — the factory and
 * the shape of `fromXML`'s result — so a minimal shim is enough.
 *
 * The real package exports `SimpleBpmnModdle` under the name `BpmnModdle`
 * (ESM named export) and has no `default` export.  Consumers call it as a
 * plain function, not with `new`.  We also declare `default` here so callers
 * that go through a bundler's ESM→CJS interop can still compile — at runtime
 * they must tolerate `default` being `undefined`.
 */
declare module "bpmn-moddle" {
    interface ParseResult {
        rootElement: {
            $type: string;
            [key: string]: unknown;
        };
        references: unknown[];
        warnings: unknown[];
    }

    interface ModdleElement {
        $type: string;
        [key: string]: unknown;
    }

    interface BpmnModdleInstance {
        fromXML(xml: string): Promise<ParseResult>;
        create(type: string, attrs?: Record<string, unknown>): ModdleElement;
        getTypeDescriptor(type: string): unknown;
    }

    type BpmnModdleFactory = (
        additionalPackages?: Record<string, unknown>,
        options?: unknown,
    ) => BpmnModdleInstance;

    export const BpmnModdle: BpmnModdleFactory;

    const _default: BpmnModdleFactory | undefined;
    export default _default;
}
