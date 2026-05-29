import { posix } from "path";

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { EditorStore } from "../infrastructure/EditorStore";
import { VsCodeDocument } from "../infrastructure/VsCodeDocument";
import { VsCodeNotifier } from "../infrastructure/VsCodeNotifier";
import { VsCodeStatusBar } from "../infrastructure/VsCodeStatusBar";
import { ArtifactChangeTarget, ArtifactService } from "./ArtifactService";

/**
 * Loads BPMN element templates from the workspace and pushes them to the
 * webview. Implements {@link ArtifactChangeTarget} so the artifact watcher
 * created by {@link ArtifactService.createWatcher} can re-trigger a load
 * when a template file changes on disk.
 */
export class BpmnElementTemplatesService implements ArtifactChangeTarget {
    constructor(
        private readonly editorStore: EditorStore,
        private readonly vsDocument: VsCodeDocument,
        private readonly artifactSvc: ArtifactService,
        private readonly statusBar: VsCodeStatusBar,
        private readonly notifier: VsCodeNotifier,
    ) {}

    async setElementTemplates(editorId: string): Promise<boolean> {
        this.statusBar.showElementTemplatesLoading();
        try {
            const documentDir = posix.dirname(this.vsDocument.getFilePath(editorId));

            const [artifacts] = await this.artifactSvc.getArtifactPaths(documentDir);

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
                    this.notifier.logInfo(`${artifacts.length} element templates are set.`);
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
