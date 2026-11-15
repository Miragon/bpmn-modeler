interface ModdlePropertyDescriptor {
    name: string;
    isAttr?: boolean;
    isAttribute?: boolean;
    isReference?: boolean;
    isVirtual?: boolean;
    /** The qualified name, for example `bpmn:incoming`. */
    ns?: { name?: string };
}

export interface ModdleElement {
    $type: string;
    $attrs?: Record<string, string>;
    $children?: ModdleElement[];
    $descriptor: {
        isGeneric?: boolean;
        ns?: { prefix?: string; uri?: string };
        properties?: ModdlePropertyDescriptor[];
    };
    $instanceOf?: (type: string) => boolean;
    id?: string;
    [key: string]: unknown;
}

/** Whether `element` is of `type` or a subtype; a generic element only by its own type name. */
export function isType(element: ModdleElement, type: string): boolean {
    return element.$type === type || element.$instanceOf?.(type) === true;
}

export function isModdleElement(value: unknown): value is ModdleElement {
    return Boolean(
        value && typeof value === "object" && "$type" in value && "$descriptor" in value,
    );
}

/** The elements of a moddle list, nothing for an unset one. */
export function moddleElements(value: unknown): ModdleElement[] {
    return Array.isArray(value) ? value.filter(isModdleElement) : [];
}

export function idOf(value: unknown): string | undefined {
    return isModdleElement(value) ? value.id : undefined;
}

export function idsOf(value: unknown): string[] {
    return Array.isArray(value)
        ? value.map(idOf).filter((id): id is string => id !== undefined)
        : [];
}
