interface FakeTemplate {
    id?: string;
    version?: number;
    appliesTo?: string[];
    isDefault?: boolean;
}

interface FakeElement {
    type: string;
}

/**
 * The lookups of bpmn-js-element-templates' `elementTemplates` service over a
 * fixed list: `getLatest` keeps the highest version per id (an unversioned copy
 * loses to a versioned one), and an element narrows by `appliesTo`.
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
        getLatest(elementOrId?: string | FakeElement, _options?: { deprecated?: boolean }) {
            if (typeof elementOrId === "string") {
                const latest = latestOf(elementOrId);
                return latest ? [latest] : undefined;
            }
            return latestTemplates().filter(appliesTo(elementOrId));
        },
        getAll(element?: FakeElement) {
            return all.filter(appliesTo(element));
        },
        getDefault(element?: FakeElement): FakeTemplate | null {
            return all.filter(appliesTo(element)).find((template) => template.isDefault) ?? null;
        },
    };
}
