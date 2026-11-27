/** The bpmn-js popup menus that offer elements, element templates included. */
export const ELEMENT_POPUP_MENUS = ["bpmn-replace", "bpmn-append", "bpmn-create"] as const;

/** A bpmn-js popup entry id, e.g. `service-task`; create and append entries use it as action name. */
export type PopupEntryKey = string;

/** Where an engine's semantics differ from the engine-neutral popup-menu annotations. */
export interface PopupMenuAnnotationOverrides {
    readonly descriptions?: Readonly<Record<PopupEntryKey, string>>;
    readonly additionalKeywords?: Readonly<Record<PopupEntryKey, readonly string[]>>;
}

/**
 * Optional DI value: the engine feature provides it, the popup-menu annotations
 * read it. Shared vocabulary of two features, not a name the kernel provides.
 */
export const POPUP_MENU_ANNOTATION_OVERRIDES = "popupMenuAnnotationOverrides";
