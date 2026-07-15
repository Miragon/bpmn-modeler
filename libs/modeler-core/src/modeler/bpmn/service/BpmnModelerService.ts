import { BpmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../../../shared/domain/session";
import {
    ExecutionPlatformNotDetectedError,
    isHiddenEditorError,
    UserCancelledError,
} from "../../../shared/domain/errors";
import { getLatestVersion, getVersions } from "../../../shared/domain/engineVersions";
import { BpmnDocument } from "../../../shared/domain/BpmnDocument";
import {
    DocumentPort,
    NotifierPort,
    PickerPort,
    StatusBarPort,
} from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";

/**
 * Owns the per-editor {@link ModelerSession} map that drives echo
 * prevention: writes initiated by the webview acquire a guard before the
 * extension writes back, so the resulting `onDidChangeTextDocument` event
 * is skipped by {@link display} instead of being re-rendered.
 */
export class BpmnModelerService {
    private readonly sessions: Map<string, ModelerSession> = new Map();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly picker: PickerPort,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
    ) {}

    registerSession(editorId: string): void {
        this.sessions.set(editorId, new ModelerSession(editorId));
    }

    disposeSession(editorId: string): void {
        this.sessions.delete(editorId);
    }

    async display(editorId: string): Promise<boolean> {
        // Skip echoed document changes caused by our own write.
        const session = this.sessions.get(editorId);
        if (session?.isGuarded()) {
            return false;
        }

        try {
            let doc = new BpmnDocument(this.vsDocument.getContent(editorId));

            if (doc.isEmpty()) {
                const ep = await this.picker.pickExecutionPlatform("Select the engine.", [
                    "Camunda 7",
                    "Camunda 8",
                ]);

                doc = BpmnDocument.empty(ep, getLatestVersion(ep));
                await this.vsDocument.write(editorId, doc.xml);
                await this.vsDocument.save(editorId);
            }

            try {
                const ep = doc.detectPlatform();
                const sent = await this.editorStore.postMessage(
                    editorId,
                    new BpmnFileQuery(doc.xml, ep),
                );

                const version = doc.detectPlatformVersion();
                if (version) {
                    this.statusBar.showEngineVersion(ep, version);
                }

                return sent;
            } catch (error) {
                if (isHiddenEditorError(error)) {
                    return false;
                } else if (error instanceof ExecutionPlatformNotDetectedError) {
                    const ep = await this.picker.pickExecutionPlatform(
                        "Select the execution platform.",
                        ["Camunda 7", "Camunda 8"],
                    );

                    const latestVersion = getLatestVersion(ep);
                    const newDoc =
                        ep === "c7"
                            ? doc.withExecutionPlatform(
                                  "Camunda Platform",
                                  latestVersion,
                                  `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`,
                              )
                            : doc.withExecutionPlatform(
                                  "Camunda Cloud",
                                  latestVersion,
                                  `xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"`,
                              );

                    await this.editorStore.postMessage(editorId, new BpmnFileQuery(newDoc.xml, ep));
                    this.statusBar.showEngineVersion(ep, latestVersion);
                    return this.vsDocument.write(editorId, newDoc.xml);
                } else {
                    return this.handleError(error as Error);
                }
            }
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    async sync(editorId: string, content: string): Promise<boolean> {
        const session = this.sessions.get(editorId);
        // Guard around the write so the resulting document-change event is
        // recognised as our own echo and not re-rendered.
        session?.acquireGuard();
        try {
            return await this.vsDocument.write(editorId, content);
        } catch (error) {
            return this.handleSyncError(error as Error);
        } finally {
            session?.releaseGuard();
        }
    }

    async changeEngineVersion(editorId: string): Promise<boolean> {
        try {
            const doc = new BpmnDocument(this.vsDocument.getContent(editorId));
            const platform = doc.detectPlatform();
            const versions = getVersions(platform);

            const newVersion = await this.picker.pickEngineVersion(platform, versions);

            const updatedDoc = doc.withVersion(newVersion);
            await this.vsDocument.write(editorId, updatedDoc.xml);

            this.statusBar.showEngineVersion(platform, newVersion);
            return await this.display(editorId);
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError(
            "A problem occurred while trying to display the BPMN Modeler.",
            error,
        );
        return false;
    }

    private handleSyncError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while trying to sync the BPMN file.", error);
        return false;
    }
}
