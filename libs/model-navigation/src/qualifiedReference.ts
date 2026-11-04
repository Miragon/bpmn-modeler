/**
 * BPMN types `calledElement` as `xsd:QName`, so `child:Process_Target` names
 * `Process_Target` in the namespace bound to `child`. Process ids are NCNames
 * and never contain a colon, so a prefixed value is never a literal id. An
 * unprefixed value stays literal: resolving it against the default namespace
 * would break references in files that declare one.
 */

export interface ModdleElementLike {
    $parent?: ModdleElementLike;
    $attrs?: Record<string, unknown>;
}

export interface QualifiedReference {
    id: string;
    namespace?: string;
}

const NCNAME = "[A-Za-z_][\\w.-]*";
const PREFIXED_NAME = new RegExp(`^(${NCNAME}):(${NCNAME})$`);

export function resolveQualifiedReference(
    rawReference: string,
    element: ModdleElementLike,
): QualifiedReference {
    const prefixedName = PREFIXED_NAME.exec(rawReference);
    if (!prefixedName) {
        return { id: rawReference };
    }
    const [, prefix, localName] = prefixedName;
    const namespace = namespaceBoundTo(prefix, element);
    return namespace ? { id: localName, namespace } : { id: localName };
}

function namespaceBoundTo(prefix: string, element: ModdleElementLike): string | undefined {
    for (let scope: ModdleElementLike | undefined = element; scope; scope = scope.$parent) {
        const namespace = scope.$attrs?.[`xmlns:${prefix}`];
        if (typeof namespace === "string" && namespace.length > 0) {
            return namespace;
        }
    }
    return undefined;
}
