// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where `bpmn-moddle` is imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/bpmn-moddle.d.ts" />

import type { ModdleElement } from "./moddleElement";

export interface ModdleParseWarning {
    message?: string;
    /** For an unresolved reference: the element holding it, its qualified property and the id it names. */
    element?: ModdleElement;
    property?: string;
    value?: string;
}

/** A reference the parser met, in document order; `property` is qualified, for example `bpmn:sourceRef`. */
export interface ModdleReference {
    element: ModdleElement;
    property: string;
    id: string;
}

export interface ModdleParseResult {
    rootElement: ModdleElement;
    elementsById: Record<string, ModdleElement | undefined>;
    references?: ModdleReference[];
    warnings?: ModdleParseWarning[];
}

const UNRESOLVED_REFERENCE_PREFIX = "unresolved reference";

export function isUnresolvedReferenceWarning(warning: ModdleParseWarning): boolean {
    return warning.message?.startsWith(UNRESOLVED_REFERENCE_PREFIX) === true;
}

/** Each warning's message, in the parser's order, but those `except` holds for. */
export function parseWarningMessages(
    warnings: readonly ModdleParseWarning[] | undefined,
    except: (warning: ModdleParseWarning) => boolean = () => false,
): string[] {
    return (warnings ?? [])
        .filter((warning) => !except(warning))
        .map(({ message }) => message ?? "unnamed warning");
}

/** The parser reports content it skipped, such as an undeclared prefix, only as this warning. */
export function skippedContentWarning(result: ModdleParseResult): string | undefined {
    return result.warnings?.find((warning) =>
        warning.message?.toLowerCase().includes("unparsable content"),
    )?.message;
}

interface ModdleSerializeOptions {
    format?: boolean;
    preamble?: boolean;
}

interface ModdlePackage {
    prefix: string;
    uri: string;
}

export interface BpmnModdle {
    /** `typeName` parses the root as that type; the parser accepts any tag of the type or a supertype. */
    fromXML: (xml: string, typeName?: string) => Promise<ModdleParseResult>;
    create: (type: string, properties?: Record<string, unknown>) => ModdleElement;
    toXML: (element: ModdleElement, options?: ModdleSerializeOptions) => Promise<{ xml: string }>;
    getPackages: () => ModdlePackage[];
}

interface BpmnModdleOptions {
    /** Namespace URI to the prefix the parser names it by. */
    nsMap?: Record<string, string>;
}

export type BpmnModdleFactory = (
    packages?: Record<string, unknown>,
    options?: BpmnModdleOptions,
) => BpmnModdle;

/** Loads the parser lazily, so a consumer that never parses never pays for it. */
export async function loadBpmnModdle(): Promise<BpmnModdleFactory> {
    return resolveBpmnModdleFactory(await import("bpmn-moddle"));
}

/** bpmn-moddle 10's ESM build exports only the named `BpmnModdle`; older builds a default. */
export function resolveBpmnModdleFactory(module: unknown): BpmnModdleFactory {
    const moddleModule = module as { default?: BpmnModdleFactory; BpmnModdle?: BpmnModdleFactory };
    const createBpmnModdle = moddleModule.default ?? moddleModule.BpmnModdle;
    if (typeof createBpmnModdle !== "function") {
        throw new Error("bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.");
    }
    return createBpmnModdle;
}

/** A dynamically imported moddle descriptor, which some module systems wrap in `default` and others do not. */
export function moddleDescriptor(module: unknown): unknown {
    return (module as { default?: unknown }).default ?? module;
}
