interface FakeTemplate {
    id?: string;
    version?: number;
    appliesTo?: string[];
    isDefault?: boolean;
    deprecated?: boolean;
}

interface FakeElement {
    type: string;
    appliedTemplate?: FakeTemplate;
}

/**
 * The lookups of bpmn-js-element-templates' `elementTemplates` service over a
 * fixed list: `getLatest` keeps the highest version per id (an unversioned copy
 * loses to a versioned one) and drops an id whose latest version is deprecated
 * unless asked for those, an element narrows by `appliesTo`, and `get` finds
 * the template an element names by id and version.
 */
export function fakeElementTemplates(templates: readonly object[]) {
    const all = templates as readonly FakeTemplate[];
    const appliesTo = (element: FakeElement | undefined) => (template: FakeTemplate) =>
        !element || (template.appliesTo ?? []).includes(element.type);
    const latestOf = (id: string): FakeTemplate | undefined =>
        all
            .filter((template) => template.id === id)
            .reduce<FakeTemplate | undefined>(
                (latest, template) =>
                    !latest || (latest.version ?? -1) < (template.version ?? -1)
                        ? template
                        : latest,
                undefined,
            );
    const latestTemplates = () =>
        [...new Set(all.map((template) => template.id))]
            .filter((id): id is string => typeof id === "string")
            .map((id) => latestOf(id)!);
    return {
        getLatest(elementOrId?: string | FakeElement, options: { deprecated?: boolean } = {}) {
            const offered = (latest: FakeTemplate) => options.deprecated || !latest.deprecated;
            if (typeof elementOrId === "string") {
                const latest = latestOf(elementOrId);
                return latest ? [latest].filter(offered) : undefined;
            }
            return latestTemplates().filter(offered).filter(appliesTo(elementOrId));
        },
        getAll(element?: FakeElement) {
            return all.filter(appliesTo(element));
        },
        get(element: FakeElement): FakeTemplate | null {
            const applied = element.appliedTemplate;
            return (
                all.find(
                    (template) =>
                        applied !== undefined &&
                        template.id === applied.id &&
                        template.version === applied.version,
                ) ?? null
            );
        },
        getDefault(element?: FakeElement): FakeTemplate | null {
            return all.filter(appliesTo(element)).find((template) => template.isDefault) ?? null;
        },
    };
}
