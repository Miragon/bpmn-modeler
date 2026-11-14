interface ModdlePropertyDescriptor {
    name: string;
    isAttr?: boolean;
    isAttribute?: boolean;
    isReference?: boolean;
    isVirtual?: boolean;
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
