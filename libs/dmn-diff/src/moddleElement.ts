/** The parts of a `dmn-moddle` element the comparison reads. */
export interface ModdleElement {
    readonly $type: string;
    readonly $attrs?: Readonly<Record<string, string>>;
    readonly $parent?: ModdleElement;
    readonly $descriptor: {
        readonly isGeneric?: boolean;
        readonly properties?: readonly PropertyDescriptor[];
    };
    readonly id?: string;
    readonly [key: string]: unknown;
}

export interface PropertyDescriptor {
    readonly name: string;
    readonly isReference?: boolean;
    readonly isVirtual?: boolean;
    readonly ns?: { readonly prefix?: string };
}

export function isModdleElement(value: unknown): value is ModdleElement {
    return (
        typeof value === "object" && value !== null && "$type" in value && "$descriptor" in value
    );
}

/** A collection property; moddle leaves it undefined until the XML fills it. */
export function many(element: ModdleElement | undefined, property: string): ModdleElement[] {
    const value = element?.[property];
    return Array.isArray(value) ? value.filter(isModdleElement) : [];
}

export function one(
    element: ModdleElement | undefined,
    property: string,
): ModdleElement | undefined {
    const value = element?.[property];
    return isModdleElement(value) ? value : undefined;
}

export function idsOf(elements: readonly ModdleElement[]): string[] {
    return elements.flatMap((element) => (element.id ? [element.id] : []));
}
