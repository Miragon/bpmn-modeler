import { isSameScript, OpenScriptEditorRef } from "@miragon/bpmn-modeler-types";

import { ScriptAddress } from "./inlineScript";

/** A host tab showing one inline script of one editor. */
export interface OpenScriptTab extends ScriptAddress {
    readonly editorId: string;
}

/** Whether materialising a script writes its file: an open tab's buffer is the authoritative copy. */
export type MaterializationPlan = { readonly kind: "alreadyOpen" } | { readonly kind: "write" };

/**
 * The inline-script tabs a host has open, keyed by a tab path whose last
 * segment is the tab's file name. `Tab` carries what else a host tracks per tab.
 */
export class OpenScriptTabs<Tab extends OpenScriptTab = OpenScriptTab> {
    private readonly tabsByPath = new Map<string, Tab>();

    track(tabPath: string, tab: Tab): void {
        this.tabsByPath.set(tabPath, tab);
    }

    /** Forgets the tab at `tabPath`, returning it, or `undefined` when none was open there. */
    untrack(tabPath: string): Tab | undefined {
        const tab = this.tabsByPath.get(tabPath);
        this.tabsByPath.delete(tabPath);
        return tab;
    }

    get(tabPath: string): Tab | undefined {
        return this.tabsByPath.get(tabPath);
    }

    isOpen(tabPath: string): boolean {
        return this.tabsByPath.has(tabPath);
    }

    /** The path and tab of `editorId` that shows `script`. */
    find(editorId: string, script: ScriptAddress): readonly [string, Tab] | undefined {
        return this.ofEditor(editorId).find(([, tab]) => isSameScript(tab, script));
    }

    /** The paths and tabs of `editorId`, in the order they opened. */
    ofEditor(editorId: string): Array<readonly [string, Tab]> {
        return [...this.tabsByPath].filter(([, tab]) => tab.editorId === editorId);
    }

    /** The scripts the webview of `editorId` locks, each named after its tab. */
    openScriptsOf(editorId: string): OpenScriptEditorRef[] {
        return this.ofEditor(editorId).map(([tabPath, { elementId, kind, listenerIndex }]) => ({
            elementId,
            kind,
            listenerIndex,
            fileName: tabPath.substring(tabPath.lastIndexOf("/") + 1),
        }));
    }

    materializationOf(tabPath: string): MaterializationPlan {
        return this.isOpen(tabPath) ? { kind: "alreadyOpen" } : { kind: "write" };
    }
}
