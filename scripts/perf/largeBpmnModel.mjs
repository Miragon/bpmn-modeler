// Imported by the Chromium counter spec as well as Node, so no Node APIs here.
// The XML must stay byte-identical to the generator in #1572 so baselines remain comparable.

export const largeModelPresets = {
    500: { rows: 10, perRow: 50 },
    2000: { rows: 40, perRow: 50 },
    5000: { rows: 100, perRow: 50 },
};

const ROW_HEIGHT = 140;
const COLUMN_WIDTH = 160;

function createFlowNode(row, column, perRow) {
    const x = 100 + column * COLUMN_WIDTH;
    const rowTop = 80 + row * ROW_HEIGHT;
    if (column === 0) {
        return {
            id: `start_${row}`,
            openTag: `<bpmn:startEvent id="start_${row}" name="Start ${row}" camunda:asyncBefore="true">`,
            hasTransactionBoundary: true,
            x,
            rowTop,
            width: 36,
            height: 36,
        };
    }
    if (column === perRow - 1) {
        return {
            id: `end_${row}`,
            openTag: `<bpmn:endEvent id="end_${row}" name="End ${row}">`,
            hasTransactionBoundary: false,
            x,
            rowTop,
            width: 36,
            height: 36,
        };
    }
    if (column % 5 === 0) {
        const id = `gw_${row}_${column}`;
        return {
            id,
            openTag: `<bpmn:exclusiveGateway id="${id}" name="Check ${row}/${column}?">`,
            hasTransactionBoundary: false,
            x,
            rowTop,
            width: 50,
            height: 50,
        };
    }
    if (column % 2 === 0) {
        const id = `user_${row}_${column}`;
        return {
            id,
            openTag: `<bpmn:userTask id="${id}" name="Review item ${row}/${column}" camunda:assignee="\${initiator}" camunda:candidateGroups="team_${row}">`,
            hasTransactionBoundary: true,
            x,
            rowTop,
            width: 100,
            height: 80,
        };
    }
    const id = `svc_${row}_${column}`;
    return {
        id,
        openTag: `<bpmn:serviceTask id="${id}" name="Process step ${row}/${column}" camunda:delegateExpression="#{step${row}x${column}Delegate}" camunda:asyncAfter="true">`,
        hasTransactionBoundary: true,
        x,
        rowTop,
        width: 100,
        height: 80,
    };
}

// Each boundary node has at most one sequence flow on its boundary side, so
// `transactionBoundaryCount` equals the overlay count a correct renderer shows.
export function generateLargeC7Model({ rows, perRow }) {
    const processElements = [];
    const shapes = [];
    const edges = [];
    const editableElementIds = [];
    let transactionBoundaryCount = 0;

    for (let row = 0; row < rows; row++) {
        const flowNodes = [];
        for (let column = 0; column < perRow; column++) {
            flowNodes.push(createFlowNode(row, column, perRow));
        }
        flowNodes.forEach((node, index) => {
            const tagName = node.openTag.match(/<bpmn:(\w+)/)[1];
            const y = node.rowTop + (80 - node.height) / 2;
            const incoming =
                index > 0 ? `<bpmn:incoming>f_${row}_${index - 1}</bpmn:incoming>` : "";
            const outgoing =
                index < flowNodes.length - 1
                    ? `<bpmn:outgoing>f_${row}_${index}</bpmn:outgoing>`
                    : "";
            processElements.push(`    ${node.openTag}${incoming}${outgoing}</bpmn:${tagName}>`);
            shapes.push(
                `      <bpmndi:BPMNShape id="${node.id}_di" bpmnElement="${node.id}"><dc:Bounds x="${node.x}" y="${y}" width="${node.width}" height="${node.height}" /></bpmndi:BPMNShape>`,
            );
            if (node.hasTransactionBoundary) {
                transactionBoundaryCount++;
            }
            if (index < flowNodes.length - 1) {
                const target = flowNodes[index + 1];
                const edgeY = node.rowTop + 40;
                processElements.push(
                    `    <bpmn:sequenceFlow id="f_${row}_${index}" sourceRef="${node.id}" targetRef="${target.id}" />`,
                );
                edges.push(
                    `      <bpmndi:BPMNEdge id="f_${row}_${index}_di" bpmnElement="f_${row}_${index}"><di:waypoint x="${node.x + node.width}" y="${edgeY}" /><di:waypoint x="${target.x}" y="${edgeY}" /></bpmndi:BPMNEdge>`,
                );
            }
        });
        if (perRow > 1) {
            editableElementIds.push(`svc_${row}_1`);
        }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_large" targetNamespace="http://bpmn.io/schema/bpmn" exporter="Camunda Modeler" exporterVersion="5.20.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.24.0">
  <bpmn:process id="largeProcess" isExecutable="true" camunda:historyTimeToLive="180">
${processElements.join("\n")}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="largeProcess">
${shapes.join("\n")}
${edges.join("\n")}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`;

    return {
        xml,
        flowNodeCount: rows * perRow,
        sequenceFlowCount: rows * Math.max(perRow - 1, 0),
        transactionBoundaryCount,
        editableElementIds,
    };
}
