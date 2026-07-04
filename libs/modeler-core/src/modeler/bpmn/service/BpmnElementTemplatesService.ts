import { posix } from "path";

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentPort, NotifierPort, StatusBarPort } from "../../../shared/domain/hostPorts";
import { EditorSessionStore } from "../../../shared/infrastructure/EditorSessionStore";
import { ArtifactChangeTarget, ArtifactService } from "../../../shared/service/ArtifactService";

/**
 * Loads BPMN element templates from the workspace and pushes them to the
 * webview. Implements {@link ArtifactChangeTarget} so the artifact watcher
 * created by {@link ArtifactService.createWatcher} can re-trigger a load
 * when a template file changes on disk.
 */
export class BpmnElementTemplatesService implements ArtifactChangeTarget {
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly artifactSvc: ArtifactService,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
    ) {}

    async setElementTemplates(editorId: string): Promise<boolean> {
        this.statusBar.showElementTemplatesLoading();
        try {
            const documentDir = posix.dirname(this.vsDocument.getFilePath(editorId));

            const [artifacts] = await this.artifactSvc.getArtifactPaths(documentDir);
            this.notifier.logDebug(
                artifacts.length > 0
                    ? `Element-template files resolved: ${artifacts.join(", ")}`
                    : "No element-template files resolved.",
            );

            const parsed = await Promise.all(
                artifacts.map(async (a) => {
                    try {
                        return JSON.parse(await this.artifactSvc.readFile(a));
                    } catch (error) {
                        this.notifier.logError(
                            new Error(
                                `Failed to parse element template "${a}": ${(error as Error).message}`,
                            ),
                        );
                        return [];
                    }
                }),
            );
            const sorted = parsed
                .flat()
                .sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
                    String(a.name ?? "").localeCompare(String(b.name ?? "")),
                );

            if (await this.editorStore.postMessage(editorId, new ElementTemplatesQuery(sorted))) {
                this.statusBar.showElementTemplatesReady(sorted.length);
                if (artifacts.length > 0) {
                    // Report templates loaded vs. files scanned separately — a
                    // file can hold several templates, so conflating the two (the
                    // old message reported the file count as the template count)
                    // misled anyone cross-checking the status-bar count.
                    this.notifier.logInfo(
                        `${sorted.length} element template(s) loaded from ${artifacts.length} file(s).`,
                    );
                }
                return true;
            } else {
                this.statusBar.hideElementTemplatesStatus();
                return this.handleError(new Error("Setting the `elementTemplates` failed."));
            }
        } catch (error) {
            this.statusBar.hideElementTemplatesStatus();
            return this.handleError(error as Error);
        }
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while loading element templates.", error);
        return false;
    }
}
