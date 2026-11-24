interface PanelGroup {
    id: string;
}

interface PropertiesPanelService {
    registerProvider(
        priority: number,
        provider: { getGroups(): (groups: PanelGroup[]) => PanelGroup[] },
    ): void;
}

// After the element-template providers (300), so it sees the groups they add.
const AFTER_TEMPLATE_PROVIDERS = 100;

// The groups holding a template's fields, but not the header naming the template.
const TEMPLATE_FIELD_GROUP = /^ElementTemplates__(?!Template$)/;

/**
 * Upstream collapses a template's groups, which reads as an empty preview.
 * `shouldOpen` is only a group's default: once the user toggles it, the panel's
 * layout state wins, so an edit does not reopen a group the user collapsed.
 */
export function openTemplateGroups(propertiesPanel: PropertiesPanelService): void {
    propertiesPanel.registerProvider(AFTER_TEMPLATE_PROVIDERS, {
        getGroups: () => (groups) =>
            groups.map((group) =>
                TEMPLATE_FIELD_GROUP.test(group.id) ? { ...group, shouldOpen: true } : group,
            ),
    });
}
