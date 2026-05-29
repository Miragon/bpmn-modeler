import { DmnFileQuery } from "@miragon/bpmn-modeler-shared";

import { ModelerSession } from "../domain/session";
import { UserCancelledError } from "../domain/errors";
import { DocumentPort, NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";

// Minimal DMN XML used when opening a new blank `.dmn` file.
const EMPTY_DMN_DIAGRAM = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_1y42u6n" name="DRD" namespace="http://camunda.org/schema/1.0/dmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.8.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.18.0">
  <decision id="Decision_16wqg49" name="Decision 1">
    <decisionTable id="DecisionTable_1wi1sbd">
      <input id="Input_1">
        <inputExpression id="InputExpression_1" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="Output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape dmnElementRef="Decision_16wqg49">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;

export class DmnModelerService {
    private readonly sessions: Map<string, ModelerSession> = new Map();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
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
            let dmnFile = this.vsDocument.getContent(editorId);

            if (dmnFile === "") {
                dmnFile = EMPTY_DMN_DIAGRAM;
                await this.vsDocument.write(editorId, dmnFile);
                await this.vsDocument.save(editorId);
            }

            return await this.editorStore.postMessage(editorId, new DmnFileQuery(dmnFile));
        } catch (error) {
            if (error instanceof UserCancelledError) {
                return false;
            }
            if (error instanceof Error && error.message === "The active editor is hidden.") {
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

    private handleError(error: Error): boolean {
        this.notifier.logError(error);
        this.notifier.showError(
            `A problem occurred while trying to display the DMN Modeler.\n${error.message ?? error}`,
        );
        return false;
    }

    private handleSyncError(error: Error): boolean {
        this.notifier.logError(error);
        this.notifier.showError(
            `A problem occurred while trying to sync the DMN file.\n${error.message}`,
        );
        return false;
    }
}
