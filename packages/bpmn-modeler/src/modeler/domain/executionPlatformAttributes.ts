import {
    MODELER_NAMESPACE_URI,
    executionPlatformAttributeNames,
} from "@miragon/bpmn-modeler-types/domain";

/** The part of a moddle `bpmn:Definitions` element the execution platform is read from. */
export interface ModdleDefinitions {
    readonly $attrs: Readonly<Record<string, string>>;
    readonly $model: { getPackage(uriOrPrefix: string): { prefix: string } | undefined };
    get(name: string): unknown;
}

/** The execution-platform attributes of a moddle `bpmn:Definitions`. */
export class ExecutionPlatformAttributes {
    constructor(private readonly definitions: ModdleDefinitions) {}

    /**
     * The attributes, keyed by their XML names next to the binding of their prefix.
     *
     * moddle keeps the attributes of a namespace no package registers in `$attrs`,
     * under the prefix the file binds. A package a consumer registers for the
     * modeler namespace (`moddleExtensions`) reads them into typed properties under
     * its own prefix instead, whichever prefix the file binds.
     */
    read(): Readonly<Record<string, string>> {
        const registeredPrefix = this.definitions.$model.getPackage(MODELER_NAMESPACE_URI)?.prefix;
        if (registeredPrefix === undefined) {
            return this.definitions.$attrs;
        }
        return this.readTypedUnder(registeredPrefix);
    }

    /** The engine version the diagram targets, from its `executionPlatformVersion`. */
    version(): string | undefined {
        const attributes = this.read();
        const names = executionPlatformAttributeNames(
            Object.entries(attributes).map(([name, value]) => ({ name, value })),
        );
        return attributes[names.version];
    }

    private readTypedUnder(prefix: string): Readonly<Record<string, string>> {
        const names = executionPlatformAttributeNames([
            { name: `xmlns:${prefix}`, value: MODELER_NAMESPACE_URI },
        ]);
        const attributes: Record<string, string> = { [names.namespace]: MODELER_NAMESPACE_URI };
        for (const name of [names.platform, names.version]) {
            const value = this.definitions.get(name);
            if (typeof value === "string") {
                attributes[name] = value;
            }
        }
        return attributes;
    }
}
