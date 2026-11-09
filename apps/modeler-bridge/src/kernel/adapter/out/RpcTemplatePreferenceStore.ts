import {
    TemplatePreferenceChange,
    TemplatePreferencesByScope,
    templatePreferencesByScopeKey,
    TemplatePreferenceStorePort,
    TemplateSwitch,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import {
    EmptyParams,
    TemplatePreferencesChangeParams,
    TemplatePreferencesScopeSnapshot,
    TemplatePreferencesSnapshot,
} from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { TemplatePreferencesMirror } from "../../port/TemplatePreferencesMirror";

/**
 * IntelliJ's template switches, the project's and the application's, mirrored
 * for the core's synchronous `read()`. The host seeds the mirror after every
 * spawn and on `session/register`, and pushes both lists in
 * `templatePreferences/didChange` after a change: an all-projects change to
 * every running bridge of the IDE, a project change to this project's.
 *
 * The host is the writer of record: `change` sends only the switches to
 * disable and to enable in one scope, the host merges them into the list it
 * stores and answers with both lists. A refused change leaves the mirror as it
 * was. `readStored` asks the host rather than trusting the mirror, and answers
 * a newer list the host pushed before its answer arrived.
 *
 * Each scope carries its own host revision and the mirror keeps the newest of
 * each: a register runs on its editor's queue and a push on its own, so they
 * can apply out of the host's order, and a reply can arrive after a newer push.
 */
export class RpcTemplatePreferenceStore
    implements TemplatePreferenceStorePort, TemplatePreferencesMirror
{
    // A respawned bridge starts below the host's first revision.
    private snapshot: TemplatePreferencesSnapshot = {
        project: { disabled: [], revision: 0 },
        allProjects: { disabled: [], revision: 0 },
    };
    private readonly listeners = new Set<() => void>();

    constructor(private readonly rpc: Rpc) {}

    read(): TemplatePreferencesByScope {
        return {
            project: { disabled: this.snapshot.project.disabled },
            allProjects: { disabled: this.snapshot.allProjects.disabled },
        };
    }

    async change({ scope, disable, enable }: TemplatePreferenceChange): Promise<void> {
        const stored = (await this.rpc.request(METHODS.templatePreferencesChange, {
            scope,
            disable: copyOf(disable),
            enable: copyOf(enable),
        } satisfies TemplatePreferencesChangeParams)) as TemplatePreferencesSnapshot;
        this.apply(stored);
    }

    async readStored(): Promise<TemplatePreferencesByScope> {
        const stored = (await this.rpc.request(
            METHODS.templatePreferencesRead,
            {} satisfies EmptyParams,
        )) as TemplatePreferencesSnapshot;
        this.apply(stored);
        return this.read();
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    apply(snapshot: TemplatePreferencesSnapshot): void {
        const before = templatePreferencesByScopeKey(this.read());
        this.snapshot = {
            project: newer(this.snapshot.project, snapshot.project),
            allProjects: newer(this.snapshot.allProjects, snapshot.allProjects),
        };
        if (templatePreferencesByScopeKey(this.read()) !== before) {
            this.listeners.forEach((listener) => listener());
        }
    }
}

function newer(
    held: TemplatePreferencesScopeSnapshot,
    sent: TemplatePreferencesScopeSnapshot,
): TemplatePreferencesScopeSnapshot {
    return sent.revision > held.revision
        ? { disabled: copyOf(sent.disabled), revision: sent.revision }
        : held;
}

// Each switch is readonly, so a copy of the list is enough to keep the mirror apart.
function copyOf(switches: readonly TemplateSwitch[]): TemplateSwitch[] {
    return [...switches];
}
