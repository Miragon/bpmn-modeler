/** @jsxImportSource @bpmn-io/properties-panel/preact */
/**
 * A demo host custom-properties group — the in-page proof of the custom-group
 * slot (#1441). A host marks its group ids on `customPropertiesGroups` so the
 * design-mode filter keeps them, then registers an ordinary provider. Priority
 * 400 sits above the mode filter (10) so the group is present when the filter
 * runs and, being marked, survives it. In View the panel is readonly, so
 * `applyReadonly` disables the entry.
 *
 * Notes live in a page-local map keyed by element id, so a note survives mode
 * switches (the map outlives every surface) but not a reload.
 */
import { Group, TextFieldEntry } from "@bpmn-io/properties-panel";

const DEMO_GROUP_ID = "demoNotes";
const DEMO_PROVIDER_PRIORITY = 400;

const notes = new Map<string, string>();

interface HandleWithServices {
    getService<T = unknown>(name: string): T;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// `debounce` normally comes from the `debounceInput` DI service via
// `useService`, but that hook reads the panel's preact context — which the demo
// resolves as a second module instance (the fork is imported both via the
// package's tsconfig alias and, transitively, from `createModeler`). An identity
// debounce keeps the entry independent of that context; a note updates on each
// keystroke, which is fine for a demo field.
const identityDebounce = (fn: (...args: any[]) => void) => fn;

function NoteEntry(props: { element: any; id: string; disabled?: boolean }) {
    const { element, id, disabled } = props;

    return TextFieldEntry({
        element,
        id,
        label: "Note",
        getValue: () => notes.get(element.id) ?? "",
        setValue: (value: string) => {
            notes.set(element.id, value ?? "");
        },
        debounce: identityDebounce,
        disabled,
    });
}

function demoGroup(): any {
    return {
        id: DEMO_GROUP_ID,
        label: "Demo (host custom group)",
        component: Group,
        entries: [{ id: "demoNote", component: NoteEntry }],
    };
}

/**
 * Registers the demo group on a surface handle (viewer / designer / modeler).
 * Called once per surface, so it re-registers after every recreate switch.
 */
export function registerDemoCustomGroup(handle: HandleWithServices): void {
    handle
        .getService<{ registerGroups(ids: string[]): void }>("customPropertiesGroups")
        .registerGroups([DEMO_GROUP_ID]);
    handle
        .getService<{ registerProvider(priority: number, provider: unknown): void }>(
            "propertiesPanel",
        )
        .registerProvider(DEMO_PROVIDER_PRIORITY, {
            getGroups: (element: any) => (groups: any[]) =>
                element ? [...groups, demoGroup()] : groups,
        });
}
/* eslint-enable @typescript-eslint/no-explicit-any */
