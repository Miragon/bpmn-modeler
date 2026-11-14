/** `bpmn-moddle` ships no types; this declares only what the smoke test reads. */
declare module "bpmn-moddle" {
    interface ParseResult {
        elementsById: Record<string, Record<string, unknown> | undefined>;
    }

    export const BpmnModdle: () => { fromXML(xml: string): Promise<ParseResult> };
}
