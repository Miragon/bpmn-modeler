import { Fragment, jsx, jsxs } from "@bpmn-io/properties-panel/preact/jsx-runtime";
import type { ScriptKind } from "@miragon/bpmn-modeler-shared";

import { LISTENER_ENTRY_ID_PATTERN } from "./scriptEditorButtons";
import { OPEN_SCRIPT_EDITOR_EVENT, OpenScriptEditorEvent } from "./scriptTaskContextPad";
import { OpenScriptEditorsStore } from "./openScriptEditorsStore";
import { findListenerAt, readScriptTaskFormat } from "./scriptModel";

/**
 * Runs *below* the stock Camunda provider (which registers at priority 500).
 * The panel reduces providers high-priority-first, so a lower number runs last
 * — after the stock groups are built, which the lock override must see. A
 * genuinely lower number avoids tying 500 and relying on insertion order.
 */
const LOCK_PROVIDER_PRIORITY = 250;

// The stock Camunda script entry id (script-task group) / suffix (listener item
// entries). `ScriptProps` builds it as `${prefix}scriptValue`, with `prefix`
// empty for the script task and the listener item id for listeners.
const SCRIPT_VALUE_SUFFIX = "scriptValue";

// Height bounds for the read-only textarea. The stock field uses `autoResize`,
// which relies on layout effects we deliberately avoid here (see below); a
// clamp on the line count gives a comparable feel while staying hook-free.
const MIN_ROWS = 2;
const MAX_ROWS = 16;

/**
 * Compact padlock rendered next to the label so the field reads as locked at a
 * glance. `currentColor` lets the badge's CSS `color` drive the icon in both
 * themes without a theme-specific asset.
 */
function LockIcon(): unknown {
    return jsx("svg", {
        "class": "script-lock-badge-icon",
        "width": "10",
        "height": "10",
        "viewBox": "0 0 16 16",
        "aria-hidden": "true",
        "children": jsx("path", {
            fill: "currentColor",
            d: "M8 1a3 3 0 0 0-3 3v2H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-1V4a3 3 0 0 0-3-3zm1.5 5h-3V4a1.5 1.5 0 0 1 3 0v2z",
        }),
    });
}

/**
 * Number of textarea rows for the given script, clamped to {@link MIN_ROWS}..
 * {@link MAX_ROWS}. Pure by design: the stock `autoResize` measures the DOM in
 * a layout effect, but a hook-free renderer (see {@link LockedScriptEntry})
 * can't run effects — counting newlines approximates the same height and keeps
 * the whole component unit-testable.
 */
function clampRows(value: string): number {
    const lineCount = value ? value.split("\n").length : MIN_ROWS;
    return Math.min(MAX_ROWS, Math.max(MIN_ROWS, lineCount));
}

/**
 * Renders the read-only replacement for a locked script field: the current
 * script content in a **read-only** (not `disabled`) textarea, a "read-only"
 * badge on the label, and a clickable hint that reveals the host editor tab
 * which owns the write.
 *
 * Hand-rolls the stock `TextAreaEntry` markup (same classes, so theming applies
 * unchanged) for two reasons the library can't satisfy: its `TextArea` only
 * exposes `disabled`, whose text is unselectable in Chromium — `readOnly` is
 * what keeps the content copyable — and calling `TextAreaEntry` without the
 * `debounce` service it expects throws during render. Staying hook-free also
 * makes the component directly unit-testable (walk the returned vnode tree).
 *
 * Everything it needs is handed in as entry props by
 * {@link ScriptLockPropertiesProvider} (the panel spreads the whole entry onto
 * the component), so this stays a stable module-level component — a fresh
 * closure per render would remount the subtree on every keystroke stream-in.
 */
export function LockedScriptEntry(props: any): unknown {
    const { id, lockGetValue, lockLabel, lockBadgeText, lockHintText, lockReveal } = props;

    // Read on every render so the field mirrors keystrokes streamed from the
    // owning tab — the panel re-renders on `elements.changed`.
    const value = lockGetValue();
    const inputId = `bio-properties-panel-${id}`;

    const badge = jsxs("span", {
        class: "script-lock-badge",
        title: lockHintText,
        children: [LockIcon(), lockBadgeText],
    });

    const label = jsxs("label", {
        for: inputId,
        class: "bio-properties-panel-label",
        children: [lockLabel, badge],
    });

    const textarea = jsx("textarea", {
        "id": inputId,
        "name": id,
        "class": "bio-properties-panel-input bio-properties-panel-input-monospace",
        // `readOnly` (not `disabled`) keeps the text focusable/selectable so
        // users can copy the script while the tab owns the write path.
        "readOnly": true,
        "spellCheck": false,
        "rows": clampRows(value),
        value,
        "title": lockHintText,
        "data-gramm": "false",
    });

    const field = jsxs("div", {
        class: "bio-properties-panel-textarea script-lock-textarea",
        children: [label, textarea],
    });

    const entry = jsx("div", {
        "class": "bio-properties-panel-entry",
        "data-entry-id": id,
        "children": field,
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

    return jsxs(Fragment, { children: [entry, hint] });
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
        entry.lockBadgeText = this.translate("Read-only");
        entry.lockHintText = `${this.translate("Being edited in")} ${ref.fileName} — ${this.translate("click to focus")}`;
        // Read live so the read-only field mirrors keystrokes streamed from the tab.
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
                scriptFormat: readScriptTaskFormat(bo),
                content: bo.script || "",
            };
        }

        const listenerType =
            kind === "execution-listener" ? "camunda:ExecutionListener" : "camunda:TaskListener";
        const listener = findListenerAt(bo, listenerType, listenerIndex ?? 0);
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
