export interface ScopeAssignment {
    readonly isNewScope: boolean;
    readonly emptiedScope?: string;
}

/**
 * Which shared search scope each open editor uses, so what a scope holds lives
 * exactly as long as an editor uses it. An editor is in at most one scope, and
 * a scope is reported empty once, when its last editor leaves.
 */
export class ScopeMembership {
    private readonly scopeKeyByEditor = new Map<string, string>();
    private readonly editorsByScopeKey = new Map<string, Set<string>>();

    assign(editorId: string, scopeKey: string): ScopeAssignment {
        if (this.scopeKeyByEditor.get(editorId) === scopeKey) {
            return { isNewScope: false };
        }
        const emptiedScope = this.release(editorId);
        const editors = this.editorsByScopeKey.get(scopeKey);
        this.scopeKeyByEditor.set(editorId, scopeKey);
        if (editors) {
            editors.add(editorId);
            return { isNewScope: false, emptiedScope };
        }
        this.editorsByScopeKey.set(scopeKey, new Set([editorId]));
        return { isNewScope: true, emptiedScope };
    }

    /** @returns the key of the scope the editor left empty. */
    release(editorId: string): string | undefined {
        const scopeKey = this.scopeKeyByEditor.get(editorId);
        if (scopeKey === undefined) {
            return undefined;
        }
        this.scopeKeyByEditor.delete(editorId);
        const editors = this.editorsByScopeKey.get(scopeKey)!;
        editors.delete(editorId);
        if (editors.size > 0) {
            return undefined;
        }
        this.editorsByScopeKey.delete(scopeKey);
        return scopeKey;
    }

    clear(): void {
        this.scopeKeyByEditor.clear();
        this.editorsByScopeKey.clear();
    }
}
