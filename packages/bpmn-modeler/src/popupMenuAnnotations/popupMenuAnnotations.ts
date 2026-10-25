/** A bpmn-js popup entry id, e.g. `service-task`; create and append entries use it as action name. */
export type PopupEntryKey = string;

export interface PopupMenuAnnotation {
    readonly description?: string;
    readonly keywords: readonly string[];
}

export interface PopupMenuAnnotationOverrides {
    readonly descriptions?: Readonly<Record<PopupEntryKey, string>>;
    readonly additionalKeywords?: Readonly<Record<PopupEntryKey, readonly string[]>>;
}

export interface AnnotatableEntry {
    readonly label?: string;
    readonly description?: string;
    readonly search?: string | readonly string[];
}

const MENU_PREFIX = /^(?:create|append)-/;
const REPLACE_PREFIX = /^replace-with-/;

// bpmn-js names these replace actions differently from the popup entry they show.
const REPLACE_ACTION_ALIASES: ReadonlyMap<string, PopupEntryKey> = new Map([
    ["subprocess", "expanded-subprocess"],
    ["ad-hoc-subprocess", "expanded-ad-hoc-subprocess"],
    ["none-start", "none-start-event"],
    ["none-end", "none-end-event"],
    ["none-intermediate-throw", "none-intermediate-throwing"],
]);

export function popupEntryKeyOf(entryId: string): PopupEntryKey | undefined {
    const key = entryId.replace(MENU_PREFIX, "").replace(REPLACE_PREFIX, "");
    if (key === entryId) {
        return undefined;
    }
    return REPLACE_ACTION_ALIASES.get(key) ?? key;
}

export class PopupMenuAnnotations {
    private constructor(
        private readonly descriptions: ReadonlyMap<PopupEntryKey, string>,
        private readonly keywords: ReadonlyMap<PopupEntryKey, readonly string[]>,
    ) {}

    static of(
        descriptions: Readonly<Record<PopupEntryKey, string>>,
        keywords: Readonly<Record<PopupEntryKey, readonly string[]>>,
    ): PopupMenuAnnotations {
        return new PopupMenuAnnotations(
            new Map(Object.entries(descriptions)),
            new Map(Object.entries(keywords)),
        );
    }

    withOverrides(overrides: PopupMenuAnnotationOverrides): PopupMenuAnnotations {
        const descriptions = new Map(this.descriptions);
        for (const [key, description] of Object.entries(overrides.descriptions ?? {})) {
            descriptions.set(key, description);
        }
        const keywords = new Map(this.keywords);
        for (const [key, additionalKeywords] of Object.entries(
            overrides.additionalKeywords ?? {},
        )) {
            keywords.set(key, [...(keywords.get(key) ?? []), ...additionalKeywords]);
        }
        return new PopupMenuAnnotations(descriptions, keywords);
    }

    forEntry(entryId: string): PopupMenuAnnotation | undefined {
        const key = popupEntryKeyOf(entryId);
        return key === undefined ? undefined : this.forKey(key);
    }

    forKey(key: PopupEntryKey): PopupMenuAnnotation | undefined {
        const description = this.descriptions.get(key);
        const keywords = this.keywords.get(key) ?? [];
        if (description === undefined && keywords.length === 0) {
            return undefined;
        }
        return description === undefined ? { keywords } : { description, keywords };
    }
}

export function annotateEntry<Entry extends AnnotatableEntry>(
    entry: Entry,
    annotation: PopupMenuAnnotation,
    translate: (text: string) => string,
): Entry {
    const description =
        entry.description ??
        (annotation.description === undefined ? undefined : translate(annotation.description));
    const search =
        annotation.keywords.length === 0
            ? entry.search
            : [...searchTermsOf(entry), ...annotation.keywords];
    return {
        ...entry,
        ...(description === undefined ? {} : { description }),
        ...(search === undefined ? {} : { search }),
    };
}

function searchTermsOf(entry: AnnotatableEntry): readonly string[] {
    if (entry.search === undefined) {
        return [];
    }
    return typeof entry.search === "string" ? [entry.search] : entry.search;
}
