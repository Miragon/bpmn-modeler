/**
 * Forked from bpmn-js-properties-panel v5.65.0 (MIT). See LICENSE-upstream.
 * Neutral-mode delta: the id-uniqueness check tolerates a missing `$model.ids`
 * registry — bpmn-js only creates it on modelers (`BaseModeler#_createModdle`),
 * so on a readonly `NavigatedViewer` the entry must still render.
 */
const SPACE_REGEX = /\s/;

// for QName validation as per http://www.w3.org/TR/REC-xml/#NT-NameChar
const QNAME_REGEX = /^([a-z][\w-.]*:)?[a-z_][\w-.]*$/i;

// for ID validation as per BPMN Schema (QName - Namespace)
const ID_REGEX = /^[a-z_][\w-.]*$/i;

export function isIdValid(
    element: any,
    idValue: string,
    translate: (template: string) => string,
): string | undefined {
    const assigned = element.$model.ids?.assigned(idValue);
    const idAlreadyExists = assigned && assigned !== element;

    if (!idValue) {
        return translate("ID must not be empty.");
    }

    if (idAlreadyExists) {
        return translate("ID must be unique.");
    }

    return validateId(idValue, translate);
}

function validateId(idValue: string, translate: (template: string) => string): string | undefined {
    if (containsSpace(idValue)) {
        return translate("ID must not contain spaces.");
    }

    if (!ID_REGEX.test(idValue)) {
        if (QNAME_REGEX.test(idValue)) {
            return translate("ID must not contain prefix.");
        }

        return translate("ID must be a valid QName.");
    }

    return undefined;
}

function containsSpace(value: string): boolean {
    return SPACE_REGEX.test(value);
}
