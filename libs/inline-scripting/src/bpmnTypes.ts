/**
 * Structural slivers of the bpmn-js / bpmn-moddle shapes the inline-scripting
 * cluster reads off Camunda 7 script tasks and listeners. Kept minimal and
 * decoupled from bpmn-moddle's generated types — every member here is one the
 * modules actually touch. `get` is narrowed to string attributes because that
 * is the only kind of value this cluster reads through it.
 */

export interface ModdleElement {
    $type?: string;
    get?(name: string): string | undefined;
}

export interface ScriptModdle extends ModdleElement {
    value?: string;
    scriptFormat?: string;
    resource?: string;
}

export interface ListenerModdle extends ModdleElement {
    event?: string;
    script?: ScriptModdle;
}

export interface ScriptTaskBusinessObject extends ModdleElement {
    script?: string;
    scriptFormat?: string;
    resource?: string;
    extensionElements?: { values?: ListenerModdle[] };
}

export interface Element {
    id: string;
    type?: string;
    businessObject?: ScriptTaskBusinessObject;
}

/** The `elementRegistry.get` sliver used by single-script lookups. */
export interface ElementLookup {
    get(elementId: string): Element | undefined;
}

/** The `elementRegistry.getAll` sliver used by the bulk collector. */
export interface ElementCollection {
    getAll(): Element[];
}
