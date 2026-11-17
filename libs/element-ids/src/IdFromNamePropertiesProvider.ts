import type { DiagramElementLike } from "./candidates";
import type { ElementIdsService } from "./ElementIdsService";
import { IdFromNameEntry } from "./IdFromNameEntry";
import { fallbackTranslate, type Translate } from "./translate";

/**
 * Below the engine (500) and element-template (300) providers, which rebuild
 * the general group, and above the design-mode filter (10), which must see the entry.
 */
const ID_FROM_NAME_PRIORITY = 200;

interface PropertiesEntry {
    id?: string;
}

interface PropertiesGroup {
    id?: string;
    entries?: PropertiesEntry[];
}

interface PropertiesPanelLike {
    registerProvider(priority: number, provider: IdFromNamePropertiesProvider): void;
}

interface InjectorLike {
    get<T>(name: string, strict: false): T | null;
}

/**
 * Puts the ID-from-name links right under the ID field. A separate provider,
 * because Implement mode renders the upstream panel, whose ID entry we do not own.
 */
export class IdFromNamePropertiesProvider {
    static $inject = ["injector", "elementIds"];

    private readonly translate: Translate;

    constructor(
        injector: InjectorLike,
        private readonly elementIds: ElementIdsService,
    ) {
        this.translate = injector.get<Translate>("translate", false) ?? fallbackTranslate;
        injector
            .get<PropertiesPanelLike>("propertiesPanel", false)
            ?.registerProvider(ID_FROM_NAME_PRIORITY, this);
    }

    getGroups(element: DiagramElementLike) {
        return (groups: PropertiesGroup[]) => {
            const entries = groups.find((group) => group?.id === "general")?.entries;
            const idIndex = entries?.findIndex((entry) => entry?.id === "id") ?? -1;
            if (entries && idIndex >= 0) {
                entries.splice(idIndex + 1, 0, {
                    id: "idFromName",
                    component: IdFromNameEntry,
                    isEdited: () => false,
                    element,
                    proposalFor: (target: DiagramElementLike) =>
                        this.elementIds.proposalFor(target),
                    renameFromName: (target: DiagramElementLike) =>
                        this.elementIds.renameFromName(target),
                    openReview: this.elementIds.hostReview(),
                    translate: this.translate,
                } as PropertiesEntry);
            }
            return groups;
        };
    }
}
