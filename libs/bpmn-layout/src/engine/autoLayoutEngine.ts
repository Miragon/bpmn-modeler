// Bundler and consumer tsc programs do not pick up this lib's ambient shims
// from its own tsconfig `include`, so both are pulled in explicitly via
// triple-slash references, which every program honours.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-auto-layout.d.ts" />
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../types/bpmn-moddle.d.ts" />

import { LayoutError, layoutProcess } from "bpmn-auto-layout";

import type { LayoutDiagnostic } from "@miragon/bpmn-modeler-types";

import { LayoutEngineError } from "../port";
import type { LayoutEngine } from "../port";
import type { EdgeGeometry, LayoutResult, Point, ShapeGeometry } from "../types";

interface ParsedNode {
    $type: string;
    id?: string;
    [key: string]: unknown;
}

function asArray(value: unknown): ParsedNode[] {
    return Array.isArray(value) ? (value as ParsedNode[]) : [];
}

function refId(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
        const id = (value as ParsedNode).id;
        return typeof id === "string" ? id : undefined;
    }
    return undefined;
}

function toNumber(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * `bpmn-moddle` has no `default` export — its ESM dist only re-exports the
 * factory as `BpmnModdle`. Webpack's ESM→CJS interop does not synthesize
 * `.default` while Vite's dep optimizer exposes the named binding, so both
 * shapes are accepted.
 */
type ModdleFactory = () => { fromXML: (xml: string) => Promise<{ rootElement: unknown }> };

async function parse(xml: string): Promise<ParsedNode> {
    const moddleMod = (await import("bpmn-moddle")) as unknown as {
        default?: ModdleFactory;
        BpmnModdle?: ModdleFactory;
    };
    const createModdle = moddleMod.default ?? moddleMod.BpmnModdle;
    if (!createModdle) throw new Error("bpmn-moddle exposes no factory");

    const { rootElement } = await createModdle().fromXML(xml);
    return rootElement as ParsedNode;
}

/**
 * Reads absolute geometry out of the DI the engine produced.
 *
 * Walks every plane, not just the first: an expanded subprocess gets its own
 * `BPMNDiagram`, and ids are unique across the definitions, so one flat result
 * is unambiguous.
 */
function collectGeometry(definitions: ParsedNode): {
    shapes: ShapeGeometry[];
    edges: EdgeGeometry[];
} {
    const shapes: ShapeGeometry[] = [];
    const edges: EdgeGeometry[] = [];

    for (const diagram of asArray(definitions.diagrams)) {
        const plane = diagram.plane as ParsedNode | undefined;
        if (!plane) continue;

        for (const element of asArray(plane.planeElement)) {
            const id = refId(element.bpmnElement);
            if (!id) continue;

            if (element.$type === "bpmndi:BPMNShape") {
                const bounds = element.bounds as ParsedNode | undefined;
                const x = toNumber(bounds?.x);
                const y = toNumber(bounds?.y);
                const width = toNumber(bounds?.width);
                const height = toNumber(bounds?.height);
                if (
                    x === undefined ||
                    y === undefined ||
                    width === undefined ||
                    height === undefined
                ) {
                    continue;
                }
                shapes.push({ id, x, y, width, height });
                continue;
            }

            if (element.$type === "bpmndi:BPMNEdge") {
                const waypoints = asArray(element.waypoint)
                    .map((point) => ({ x: toNumber(point.x), y: toNumber(point.y) }))
                    .filter(
                        (point): point is Point => point.x !== undefined && point.y !== undefined,
                    );
                if (waypoints.length >= 2) edges.push({ id, waypoints });
            }
        }
    }

    return { shapes, edges };
}

function toDiagnostic(warning: {
    code?: string;
    message?: string;
    elementId?: string;
}): LayoutDiagnostic {
    return {
        message: warning.message || warning.code || "Layout warning",
        elementId: warning.elementId,
    };
}

/**
 * The {@link LayoutEngine} backed by `bpmn-auto-layout`.
 *
 * The engine is greenfield — it clears `definitions.diagrams` and rebuilds DI
 * from scratch. That destructiveness stops here: this adapter *reads* geometry
 * out of the result and discards the XML, so anything the engine omitted keeps
 * the DI it already has in the live model.
 */
export class BpmnAutoLayoutEngine implements LayoutEngine {
    async computeLayout(xml: string): Promise<LayoutResult> {
        let laidOutXml: string;
        let diagnostics: LayoutDiagnostic[];

        try {
            const { xml: result, warnings } = await layoutProcess(xml);
            laidOutXml = result;
            diagnostics = warnings.map(toDiagnostic);
        } catch (error) {
            throw new LayoutEngineError(describeFailure(error), error);
        }

        try {
            const { shapes, edges } = collectGeometry(await parse(laidOutXml));
            return { shapes, edges, diagnostics };
        } catch (error) {
            // The engine succeeded but produced XML we cannot read back. Same
            // outcome for the caller — no geometry — but worth distinguishing
            // in the message, because it points at us rather than at the model.
            throw new LayoutEngineError(
                `Could not read the generated diagram interchange: ${messageOf(error)}`,
                error,
            );
        }
    }
}

function describeFailure(error: unknown): string {
    if (error instanceof LayoutError) {
        const where = error.elementId ? ` (${error.elementId})` : "";
        return `${error.message || error.code}${where}`;
    }
    return messageOf(error);
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
