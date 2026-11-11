// The consumer programs (modeler-core, the webview) do not pick up this lib's
// ambient shim from its tsconfig, so it is referenced explicitly.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/dmn-moddle.d.ts" />

import { compareDefinitions } from "./compareDefinitions";
import type { DmnDiffResult } from "./dmnDiffResult";
import type { ModdleElement } from "./moddleElement";

interface ParseResult {
    readonly rootElement: ModdleElement;
    readonly warnings?: ReadonlyArray<{ readonly message?: string }>;
}

type DmnModdleFactory = (packages?: Record<string, unknown>) => {
    fromXML: (xml: string, typeName: string) => Promise<ParseResult>;
};

/**
 * Compares two DMN 1.3 documents and returns a serializable
 * {@link DmnDiffResult}.
 *
 * Node- and browser-safe: it touches no DOM. The parser and the Camunda
 * descriptor load lazily. Throws on a parse failure and on content the parser
 * would skip, so the caller can report it.
 */
export async function computeDmnDiff(beforeXml: string, afterXml: string): Promise<DmnDiffResult> {
    const [moddleModule, camundaModule] = await Promise.all([
        import("dmn-moddle"),
        import("camunda-dmn-moddle/resources/camunda.json"),
    ]);
    const createModdle = (moddleModule as { DmnModdle?: DmnModdleFactory }).DmnModdle;
    if (typeof createModdle !== "function") {
        throw new Error("dmn-moddle did not expose a `DmnModdle` factory.");
    }
    const camunda = (camundaModule as { default?: unknown }).default ?? camundaModule;
    const moddle = createModdle({ camunda });

    const [before, after] = await Promise.all([
        parse(moddle.fromXML(beforeXml, "dmn:Definitions"), "before"),
        parse(moddle.fromXML(afterXml, "dmn:Definitions"), "after"),
    ]);
    return compareDefinitions(before, after);
}

async function parse(result: Promise<ParseResult>, revision: string): Promise<ModdleElement> {
    const { rootElement, warnings } = await result;
    const skipped = warnings?.find((warning) =>
        warning.message?.toLowerCase().includes("unparsable content"),
    );
    if (skipped) {
        throw new Error(`Failed to parse the ${revision} DMN: ${skipped.message}`);
    }
    return rootElement;
}
