import {
    ProjectScope,
    TemplatePreferences,
    templatePreferencesAfter,
    templatePreferencesKey,
} from "@miragon/bpmn-modeler-core";
import { describeTemplatePreferenceStoreContract } from "@miragon/bpmn-modeler-core/testing";

import { bindHandlers } from "../../../composition/bindHandlers";
import { createStdinHandler } from "../../../composition/stdioBinding";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    TemplatePreferencesChangeParams,
    TemplatePreferencesSnapshot,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { templatePreferenceHandlers } from "../in/templatePreferenceHandlers";
import { RpcTemplatePreferenceStore } from "./RpcTemplatePreferenceStore";

interface CoreFrame {
    readonly id: number;
    readonly method: string;
    readonly params: TemplatePreferencesChangeParams;
}

interface StoredScope {
    preferences: TemplatePreferences;
    revision: number;
}

/**
 * IntelliJ's `TemplatePreferenceRouter` over the project's and the
 * application's `PropertiesComponent`: a change is merged into its scope's
 * list at that scope's next revision, which goes to the bridge in
 * `templatePreferences/didChange` with the other scope's list and then
 * answers the request, all from the host's reader thread after the request
 * left the bridge. A change that keeps every switch bumps no revision, pushes
 * nothing and answers both lists. A change that names a switch twice answers
 * an error and stores nothing; a read answers both lists.
 */
class IntellijTemplatePreferenceStore {
    readonly scopes: Record<ProjectScope, StoredScope> = {
        project: { preferences: { disabled: [] }, revision: 1 },
        allProjects: { preferences: { disabled: [] }, revision: 1 },
    };

    constructor(private readonly sendToBridge: (chunk: string) => void) {}

    receive(line: string): void {
        const { id, method, params } = JSON.parse(line) as CoreFrame;
        setTimeout(() => {
            const frames =
                method === METHODS.templatePreferencesChange
                    ? this.change(id, params)
                    : method === METHODS.templatePreferencesRead
                      ? [{ id, result: this.snapshot() }]
                      : [{ id, error: `No handler for ${method}` }];
            this.sendToBridge(frames.map((frame) => `${JSON.stringify(frame)}\n`).join(""));
        }, 0);
    }

    snapshot(): TemplatePreferencesSnapshot {
        const scopeSnapshot = (scope: ProjectScope) => ({
            disabled: [...this.scopes[scope].preferences.disabled],
            revision: this.scopes[scope].revision,
        });
        return { project: scopeSnapshot("project"), allProjects: scopeSnapshot("allProjects") };
    }

    store(scope: ProjectScope, preferences: TemplatePreferences): void {
        this.scopes[scope] = { preferences, revision: this.scopes[scope].revision + 1 };
    }

    private change(id: number, change: TemplatePreferencesChangeParams): object[] {
        const stored = this.scopes[change.scope].preferences;
        let merged: TemplatePreferences;
        try {
            merged = templatePreferencesAfter(stored, change);
        } catch (error) {
            return [{ id, error: String(error) }];
        }
        if (templatePreferencesKey(merged) === templatePreferencesKey(stored)) {
            return [{ id, result: this.snapshot() }];
        }
        this.store(change.scope, merged);
        const snapshot = this.snapshot();
        return [
            { method: METHODS.templatePreferencesDidChange, params: snapshot },
            { id, result: snapshot },
        ];
    }
}

describeTemplatePreferenceStoreContract(
    "RpcTemplatePreferenceStore over a loopback to IntelliJ's project and application stores",
    async () => {
        let fromHost: (chunk: string) => void = () => undefined;
        const host = new IntellijTemplatePreferenceStore((chunk) => fromHost(chunk));
        const rpc = new Rpc((line) => host.receive(line));
        fromHost = createStdinHandler(rpc, (text) => {
            throw new Error(text);
        });
        const store = new RpcTemplatePreferenceStore(rpc);
        bindHandlers(rpc, templatePreferenceHandlers(store));
        return {
            store,
            storeElsewhere: async (scope, preferences, { notify = false } = {}) => {
                host.store(scope, preferences);
                if (notify) {
                    await rpc.handleLine(
                        JSON.stringify({
                            method: METHODS.templatePreferencesDidChange,
                            params: host.snapshot(),
                        }),
                    );
                }
            },
        };
    },
);
