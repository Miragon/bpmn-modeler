package io.miragon.intellij.bpmn

import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.project.DumbAwareAction

/**
 * Tools ▸ New DMN Model (also Project view ▸ New) — creates a `.dmn` file seeded
 * with a minimal decision table and opens it. The IntelliJ counterpart of the VS
 * Code `miragon.dmnModeler.newDiagram` command.
 *
 * Unlike BPMN, the DMN scaffold is replicated here as a Kotlin constant rather
 * than deferred to the core: there is no IntelliJ DMN editor or bridge session, so
 * no `display()` empty branch would fire. The file opens in the plain XML editor.
 */
class NewDmnModelAction : DumbAwareAction() {
    override fun actionPerformed(event: AnActionEvent) {
        NewModelSupport.createModelFile(
            event,
            dialogTitle = "New DMN Model",
            dialogDescription = "Create a new empty DMN decision",
            extension = "dmn",
            defaultName = "decision.dmn",
            content = EMPTY_DMN_DIAGRAM,
        )
    }

    private companion object {
        // Host-replicated mirror of EMPTY_DMN_DIAGRAM in
        // libs/modeler-core/src/modeler/dmn/domain/emptyDmn.ts — keep byte-identical.
        // A full decision table + DMNDI so DMN-js could render it without errors.
        val EMPTY_DMN_DIAGRAM =
            """
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
            """.trimIndent()
    }
}
