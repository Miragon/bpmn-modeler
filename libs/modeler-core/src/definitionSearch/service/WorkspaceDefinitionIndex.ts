import { extractModelDefinitions, type ModelDefinition } from "@miragon/bpmn-modeler-types";

import type { NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { ScopeMembership } from "../../kernel/domain/ScopeMembership";
import {
    type SearchScope,
    searchScopeKey,
    searchScopeRoots,
} from "../../kernel/domain/searchScope";
import { findFilesInScope, resolveSearchScope } from "../../kernel/service/workspaceFileSearch";

const BPMN_GLOB = "**/*.bpmn";

export interface IndexedModel {
    readonly path: string;
    readonly definitions: readonly ModelDefinition[];
}

interface ScopeState {
    readonly scope: SearchScope;
    readonly watchers: { dispose(): void }[];
    readonly definitionsByPath: Map<string, Promise<readonly ModelDefinition[]>>;
    paths?: Promise<string[]>;
}

/**
 * Messages, signals, errors and escalations of every `.bpmn` file in an
 * editor's search scope. Built lazily on the first search and kept current by
 * file watchers, so edits in other files show up without a reload.
 */
export class WorkspaceDefinitionIndex {
    private readonly scopes = new Map<string, ScopeState>();
    private readonly membership = new ScopeMembership();

    constructor(
        private readonly workspace: WorkspacePort,
        private readonly notifier: NotifierPort,
    ) {}

    async modelsFor(editorId: string, sourcePath: string): Promise<IndexedModel[]> {
        const state = this.scopeStateFor(editorId, sourcePath);
        if (!state) {
            return [];
        }
        const paths = await this.listPaths(state);
        return Promise.all(
            paths.map(async (path) => ({
                path,
                definitions: await this.definitionsOf(state, path),
            })),
        );
    }

    releaseEditor(editorId: string): void {
        this.disposeScope(this.membership.release(editorId));
    }

    dispose(): void {
        for (const state of this.scopes.values()) {
            state.watchers.forEach((watcher) => watcher.dispose());
        }
        this.scopes.clear();
        this.membership.clear();
    }

    // Workspace folders can change while an editor is open, so the scope is
    // resolved again on every search.
    private scopeStateFor(editorId: string, sourcePath: string): ScopeState | undefined {
        const scope = resolveSearchScope(this.workspace, sourcePath);
        if (!scope) {
            return undefined;
        }
        const scopeKey = searchScopeKey(scope);
        const { isNewScope, emptiedScope } = this.membership.assign(editorId, scopeKey);
        this.disposeScope(emptiedScope);
        if (isNewScope) {
            this.scopes.set(scopeKey, this.createScope(scope));
        }
        return this.scopes.get(scopeKey);
    }

    private disposeScope(scopeKey: string | undefined): void {
        if (scopeKey === undefined) {
            return;
        }
        this.scopes.get(scopeKey)?.watchers.forEach((watcher) => watcher.dispose());
        this.scopes.delete(scopeKey);
    }

    private createScope(scope: SearchScope): ScopeState {
        const state: ScopeState = {
            scope,
            watchers: [],
            definitionsByPath: new Map(),
        };
        const forgetFile = (path: string) => {
            state.definitionsByPath.delete(path);
        };
        const forgetFileAndListing = (path: string) => {
            forgetFile(path);
            state.paths = undefined;
        };
        for (const root of searchScopeRoots(scope)) {
            try {
                state.watchers.push(
                    this.workspace.createWatcher(root, BPMN_GLOB, {
                        onChange: forgetFile,
                        onCreate: forgetFileAndListing,
                        onDelete: forgetFileAndListing,
                    }),
                );
            } catch (error) {
                this.notifier.logWarning(
                    `Could not watch BPMN files under ${root}: ${(error as Error).message}`,
                );
            }
        }
        return state;
    }

    private listPaths(state: ScopeState): Promise<string[]> {
        if (state.paths) {
            return state.paths;
        }
        const listing = findFilesInScope(this.workspace, state.scope, BPMN_GLOB, {
            matchesWalkedFile: (path) => path.endsWith(".bpmn"),
        });
        state.paths = listing;
        listing.catch(() => {
            if (state.paths === listing) {
                state.paths = undefined;
            }
        });
        return listing;
    }

    private definitionsOf(state: ScopeState, path: string): Promise<readonly ModelDefinition[]> {
        const cached = state.definitionsByPath.get(path);
        if (cached) {
            return cached;
        }
        const read = this.workspace.readFile(path).then(extractModelDefinitions, (error) => {
            this.notifier.logWarning(`Could not read ${path}: ${(error as Error).message}`);
            if (state.definitionsByPath.get(path) === read) {
                state.definitionsByPath.delete(path);
            }
            return [];
        });
        state.definitionsByPath.set(path, read);
        return read;
    }
}
