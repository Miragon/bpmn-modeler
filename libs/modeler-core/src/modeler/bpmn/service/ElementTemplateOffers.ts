import { type ElementTemplateRef, elementTemplateRefKey } from "@miragon/bpmn-modeler-types";

import { configFolderOfArea } from "../../../kernel/domain/configArtifacts";
import {
    configFolderTemplateSourceOf,
    NO_TEMPLATE_PREFERENCES,
} from "../../../kernel/domain/templatePreferences";
import { WorkspacePort } from "../../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../../kernel/port/templatePreferencePorts";
import { ElementTemplateSource, hiddenElementTemplateRefs } from "../domain/elementTemplates";

/** What the service reads to keep templates the user switched off out of new choices. */
export interface TemplateSwitchPorts {
    readonly preferences: TemplatePreferenceStorePort;
    readonly workspace: Pick<WorkspacePort, "getWorkspaceFolderPaths">;
}

/**
 * The templates each editor was last sent and the refs hidden then, so a
 * switch change sends only the refs that changed and reads nothing from disk.
 * Without switch ports every template is offered.
 */
export class ElementTemplateOffers {
    private readonly sourcesByEditor = new Map<string, readonly ElementTemplateSource[]>();
    private readonly hiddenKeyByEditor = new Map<string, string>();

    constructor(private readonly switches?: TemplateSwitchPorts) {}

    /** Each template folder's switches belong to its config folder. */
    withSwitches(
        templateDirs: readonly string[],
        directories: readonly ElementTemplateSource[],
    ): ElementTemplateSource[] {
        if (this.switches === undefined) {
            return [...directories];
        }
        const folders = this.switches.workspace.getWorkspaceFolderPaths();
        return directories.map((directory, index) => ({
            ...directory,
            source: configFolderTemplateSourceOf(configFolderOfArea(templateDirs[index]), folders),
        }));
    }

    /** The refs a full send to the editor carries, recorded with what it was built from. */
    hiddenForSend(
        editorId: string,
        sources: readonly ElementTemplateSource[],
    ): ElementTemplateRef[] {
        const hidden = this.hiddenRefsOf(sources);
        this.sourcesByEditor.set(editorId, sources);
        this.hiddenKeyByEditor.set(editorId, hiddenKeyOf(hidden));
        return hidden;
    }

    /** Each editor whose hidden refs differ from the last ones it was sent, with the current refs. */
    changedSinceSent(): [editorId: string, hidden: ElementTemplateRef[]][] {
        return [...this.sourcesByEditor].flatMap(([editorId, sources]) => {
            const hidden = this.hiddenRefsOf(sources);
            const key = hiddenKeyOf(hidden);
            if (key === this.hiddenKeyByEditor.get(editorId)) return [];
            this.hiddenKeyByEditor.set(editorId, key);
            return [[editorId, hidden]];
        });
    }

    release(editorId: string): void {
        this.sourcesByEditor.delete(editorId);
        this.hiddenKeyByEditor.delete(editorId);
    }

    private hiddenRefsOf(sources: readonly ElementTemplateSource[]): ElementTemplateRef[] {
        return hiddenElementTemplateRefs(
            sources,
            this.switches?.preferences.read() ?? NO_TEMPLATE_PREFERENCES,
        );
    }
}

function hiddenKeyOf(hidden: readonly ElementTemplateRef[]): string {
    return JSON.stringify(hidden.map(elementTemplateRefKey));
}
