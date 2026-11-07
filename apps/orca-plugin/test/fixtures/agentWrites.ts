/** An agent adds a task where "Place Order" stands in `smoke.bpmn`, inside the diagram's bounds. */
export function withBpmnTask(text: string, label: string): string {
    return text
        .replace(
            "</bpmn:process>",
            `  <bpmn:task id="Task_Agent" name="${label}" />\n  </bpmn:process>`,
        )
        .replace(
            "</bpmndi:BPMNPlane>",
            `  <bpmndi:BPMNShape id="Task_Agent_di" bpmnElement="Task_Agent">\n        <dc:Bounds x="240" y="160" width="100" height="80" />\n      </bpmndi:BPMNShape>\n    </bpmndi:BPMNPlane>`,
        );
}

/** An agent adds a decision where "Check Credit" stands in `smoke.dmn`, inside the diagram's bounds. */
export function withDmnDecision(text: string, label: string): string {
    return text
        .replace(
            "  <dmndi:DMNDI>",
            `  <decision id="Decision_Agent" name="${label}">\n    <literalExpression id="LiteralExpression_Agent" />\n  </decision>\n  <dmndi:DMNDI>`,
        )
        .replace(
            "    </dmndi:DMNDiagram>",
            `      <dmndi:DMNShape id="DMNShape_Agent" dmnElementRef="Decision_Agent">\n        <dc:Bounds height="80" width="180" x="250" y="320" />\n      </dmndi:DMNShape>\n    </dmndi:DMNDiagram>`,
        );
}
