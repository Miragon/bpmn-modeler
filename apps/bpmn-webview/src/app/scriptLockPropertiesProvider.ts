import { TextAreaEntry } from "@bpmn-io/properties-panel";
import { Fragment, jsx, jsxs } from "@bpmn-io/properties-panel/preact/jsx-runtime";
import type { ScriptKind } from "@miragon/bpmn-modeler-shared";

import { LISTENER_ENTRY_ID_PATTERN } from "./scriptEditorButtons";
import { OPEN_SCRIPT_EDITOR_EVENT, OpenScriptEditorEvent } from "./scriptTaskContextPad";
import { OpenScriptEditorsStore } from "./openScriptEditorsStore";

/**
 * Runs *below* the stock Camunda provider (priority 1000) so its middleware
 * sees the fully-built groups and can swap the script entry's component. The
 * properties panel reduces providers high-priority-first, so a lower number
 * means "run last" — exactly where the override has to sit.
 */
const LOCK_PROVIDER_PRIORITY = 500;

// The stock Camunda script entry id (script-task group) / suffix (listener item
// entries). `ScriptProps` builds it as `${prefix}scriptValue`, with `prefix`
// empty for the script task and the listener item id for listeners.
const SCRIPT_VALUE_SUFFIX = "scriptValue";

// A locked field must never write, so its `setValue` is inert — the disabled
// textarea already blocks input, this just satisfies the entry contract.
const NOOP = (): void => undefined;

/**
 * Renders the read-only replacement for a locked script field: the current
 * script content in a disabled textarea plus a clickable hint that reveals the
 * host editor tab which owns the write.
 *
 * Everything it needs is handed in as entry props by
 * {@link ScriptLockPropertiesProvider} (the panel spreads the whole entry onto
 * the component), so this stays a stable module-level component — a fresh
 * closure per render would remount the subtree on every keystroke stream-in.
 */
function LockedScriptEntry(props: any): unknown {
    const { element, id, lockGetValue, lockLabel, lockHintText, lockReveal } = props;

    // Called as a plain function (not JSX) exactly like the stock `Script`
    // component does, so its hooks run within this component's render.
    const textArea = TextAreaEntry({
        element,
        id,
        label: lockLabel,
        getValue: lockGetValue,
        setValue: NOOP,
        disabled: true,
        monospace: true,
    });

    const hint = jsx("div", {
        class: "bio-properties-panel-description script-lock-hint",
        role: "button",
        tabIndex: 0,
        title: lockHintText,
        onClick: lockReveal,
        onKeyDown: (event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                lockReveal();
            }
        },
        children: lockHintText,
    });

    return jsxs(Fragment, { children: [textArea, hint] });
}

/**
 * bpmn-js DI service that makes a script field read-only while a host editor
 * tab owns it (single-writer arbitration).
 *
 * It registers a properties provider whose middleware walks the freshly-built
 * groups and, for any inline-script entry whose `(elementId, kind,
 * listenerIndex)` is in the {@link OpenScriptEditorsStore}, swaps the stock
 * editable `Script` component for {@link LockedScriptEntry}. Owning `setValue`
 * (rather than toggling a DOM attribute) is what makes the lock airtight: a
 * locked field has no write path at all, yet still live-updates as the tab's
 * keystrokes stream into the model.
 */
export class ScriptLockPropertiesProvider {
    static $inject = ["propertiesPanel", "openScriptEditorsStore", "eventBus", "translate"];

    constructor(
        propertiesPanel: any,
        private readonly store: OpenScriptEditorsStore,
        private readonly eventBus: any,
        private readonly translate: (template: string) => string,
    ) {
        propertiesPanel.registerProvider(LOCK_PROVIDER_PRIORITY, this);
    }

    /**
     * Properties-panel provider hook: returns a groups→groups middleware. Pure
     * transform of the array the stock providers produced, which is what makes
     * it unit-testable without a live modeler.
     */
    getGroups(element: any) {
        return (groups: any[]) => this.lockGroups(element, groups);
    }

    private lockGroups(element: any, groups: any[]): any[] {
        for (const group of groups) {
            if (!group) {
                continue;
            }
            if (group.id === "CamundaPlatform__Script" && Array.isArray(group.entries)) {
                this.lockEntry(
                    group.entries,
                    SCRIPT_VALUE_SUFFIX,
                    element,
                    element.id,
                    "script-task",
                    undefined,
                );
            } else if (this.isListenerGroup(group) && Array.isArray(group.items)) {
                for (const item of group.items) {
                    const match = LISTENER_ENTRY_ID_PATTERN.exec(item?.id ?? "");
                    if (!match || !Array.isArray(item.entries)) {
                        continue;
                    }
                    const kind: ScriptKind =
                        match[2] === "executionListener" ? "execution-listener" : "task-listener";
                    this.lockEntry(
                        item.entries,
                        `${item.id}${SCRIPT_VALUE_SUFFIX}`,
                        element,
                        match[1],
                        kind,
                        parseInt(match[3], 10),
                    );
                }
            }
        }
        return groups;
    }

    private isListenerGroup(group: any): boolean {
        return (
            group.id === "CamundaPlatform__ExecutionListener" ||
            group.id === "CamundaPlatform__TaskListener"
        );
    }

    /**
     * Replaces the script entry's component with the locked renderer when the
     * script is open on the host. Leaves the entry untouched otherwise, so an
     * unlocked field stays fully editable.
     */
    private lockEntry(
        entries: any[],
        entryId: string,
        element: any,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
    ): void {
        const ref = this.store.get(elementId, kind, listenerIndex);
        if (!ref) {
            return;
        }
        const entry = entries.find((candidate) => candidate && candidate.id === entryId);
        if (!entry) {
            return;
        }

        entry.component = LockedScriptEntry;
        entry.lockLabel = this.translate("Script");
        entry.lockHintText = `${this.translate("Being edited in")} ${ref.fileName} — ${this.translate("click to focus")}`;
        // Read live so the disabled field mirrors keystrokes streamed from the tab.
        entry.lockGetValue = () => this.readScriptValue(element, entry.script);
        entry.lockReveal = () => {
            const payload = this.buildOpenEvent(element, kind, listenerIndex);
            if (payload) {
                // The host's open handler reveals an already-tracked tab without
                // rewriting it, so this focuses the editor rather than reopening.
                this.eventBus.fire(OPEN_SCRIPT_EDITOR_EVENT, payload);
            }
        };
    }

    /** Current inline-script content, read from the moddle so it stays live. */
    private readScriptValue(element: any, script: any): string {
        const bo = script ?? element?.businessObject;
        return bo?.get?.("value") ?? bo?.get?.("script") ?? bo?.script ?? "";
    }

    /**
     * Rebuilds the open-editor payload from the current model so a reveal click
     * addresses the same script URI the tab was opened with — `scriptFormat`
     * and `eventName` feed the URI, so they must match or the host would open a
     * second tab instead of revealing the first.
     */
    private buildOpenEvent(
        element: any,
        kind: ScriptKind,
        listenerIndex: number | undefined,
    ): OpenScriptEditorEvent | undefined {
        const bo = element?.businessObject;
        if (!bo) {
            return undefined;
        }

        if (kind === "script-task") {
            return {
                elementId: element.id,
                kind,
                listenerIndex: undefined,
                eventName: undefined,
                scriptFormat:
                    bo.get?.("camunda:scriptFormat") ||
                    bo.get?.("scriptFormat") ||
                    bo.scriptFormat ||
                    "",
                content: bo.script || "",
            };
        }

        const listenerType =
            kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
        const listener = (bo.extensionElements?.values ?? []).filter(
            (value: any) => value.$type === listenerType,
        )[listenerIndex ?? 0];
        if (!listener?.script) {
            return undefined;
        }
        return {
            elementId: element.id,
            kind,
            listenerIndex,
            eventName: listener.get?.("event") ?? listener.event ?? undefined,
            scriptFormat:
                listener.script.get?.("scriptFormat") ?? listener.script.scriptFormat ?? "",
            content: listener.script.get?.("value") ?? listener.script.value ?? "",
        };
    }
}

/**
 * bpmn-js / didi module exporting the script-lock properties provider.
 * Register via `additionalModules` when creating the C7 modeler — depends on
 * the `openScriptEditorsStore` service from {@link OpenScriptEditorsStoreModule}.
 */
export const ScriptLockPropertiesProviderModule = {
    __init__: ["scriptLockPropertiesProvider"],
    scriptLockPropertiesProvider: ["type", ScriptLockPropertiesProvider],
};
