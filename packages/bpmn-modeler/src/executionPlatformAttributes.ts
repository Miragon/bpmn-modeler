import {
    MODELER_NAMESPACE_URI,
    executionPlatformAttributeNames,
} from "@miragon/bpmn-modeler-types";

/** The part of a moddle `bpmn:Definitions` element the execution platform is read from. */
export interface ModdleDefinitions {
    readonly $attrs: Readonly<Record<string, string>>;
    readonly $model: { getPackage(uriOrPrefix: string): { prefix: string } | undefined };
    get(name: string): unknown;
}

/**
 * The execution-platform attributes of a moddle `bpmn:Definitions`, keyed by
 * their XML names next to the binding of their prefix.
 *
 * moddle keeps the attributes of a namespace no package registers in `$attrs`,
 * under the prefix the file binds. A package a consumer registers for the
 * modeler namespace (`moddleExtensions`) reads them into typed properties under
 * its own prefix instead, whichever prefix the file binds.
 */
export function executionPlatformAttributes(
    definitions: ModdleDefinitions,
): Readonly<Record<string, string>> {
    const registeredPrefix = definitions.$model.getPackage(MODELER_NAMESPACE_URI)?.prefix;
    if (registeredPrefix === undefined) {
        return definitions.$attrs;
    }
    const names = executionPlatformAttributeNames([
        { name: `xmlns:${registeredPrefix}`, value: MODELER_NAMESPACE_URI },
    ]);
    const attributes: Record<string, string> = { [names.namespace]: MODELER_NAMESPACE_URI };
    for (const name of [names.platform, names.version]) {
        const value = definitions.get(name);
        if (typeof value === "string") {
            attributes[name] = value;
        }
    }
    return attributes;
}
