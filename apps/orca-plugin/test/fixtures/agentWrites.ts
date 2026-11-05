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
