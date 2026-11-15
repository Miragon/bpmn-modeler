import { loadBpmnModdle } from "./bpmnModdleFactory";
import type { ExecutionPackage } from "./executionPackages";
import { documentPrefixes, namespaceDeclarations } from "./namespaceDeclarations";
import {
    type PrefixedModdle,
    createPrefixedModdle,
    serializerPrefixes,
} from "./upstreamInternals/moddleNamespaces";

/**
 * A moddle that names each namespace declared in `prefixSources` by one
 * prefix, the first it is declared with there, so that documents parsed with
 * it write every namespace alike. The namespace of `engine` keeps the
 * descriptor's prefix, and its elements and attributes are typed.
 */
export async function createDocumentModdle(
    prefixSources: readonly string[],
    engine?: ExecutionPackage,
): Promise<PrefixedModdle> {
    const [createBpmnModdle, declarations] = await Promise.all([
        loadBpmnModdle(),
        Promise.all(prefixSources.map((source) => namespaceDeclarations(source))),
    ]);
    const packages = engine ? { [engine.prefix]: engine.descriptor } : {};
    const prefixByUri = documentPrefixes(
        declarations.flat(),
        serializerPrefixes(createBpmnModdle, packages),
    );
    return createPrefixedModdle(createBpmnModdle, prefixByUri, packages);
}
