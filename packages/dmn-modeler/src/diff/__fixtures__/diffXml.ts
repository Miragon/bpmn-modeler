/** A decision with a decision table, its input data and their requirement, laid out in a DRD. */
export function decisionXml(
    rules: readonly string[] = ["R1", "R2", "R3", "R4", "R5", "R6"],
): string {
    const ruleXml = rules
        .map(
            (id, index) => `
      <rule id="${id}">
        <description>Rule ${id}</description>
        <inputEntry id="${id}_A"><text>"${id.toLowerCase()}"</text></inputEntry>
        <inputEntry id="${id}_B"><text>&lt; ${index + 1}0</text></inputEntry>
        <outputEntry id="${id}_X"><text>"x${index}"</text></outputEntry>
        <outputEntry id="${id}_Y"><text>${index}.50</text></outputEntry>
      </rule>`,
        )
        .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" xmlns:di="http://www.omg.org/spec/DMN/20180521/DI/" id="Definitions_1" name="Shipping" namespace="http://camunda.org/schema/1.0/dmn">
  <decision id="Decision_1" name="Choose carrier">
    <informationRequirement id="IR_1"><requiredInput href="#Input_1" /></informationRequirement>
    <decisionTable id="Table_1" hitPolicy="FIRST">
      <input id="In_A" label="Country"><inputExpression id="Expr_A" typeRef="string"><text>country</text></inputExpression></input>
      <input id="In_B" label="Weight"><inputExpression id="Expr_B" typeRef="number"><text>weight</text></inputExpression></input>
      <output id="Out_X" label="Carrier" name="carrier" typeRef="string" />
      <output id="Out_Y" label="Cost" name="cost" typeRef="number" />${ruleXml}
    </decisionTable>
  </decision>
  <decision id="Decision_2" name="Surcharge">
    <variable id="Var_2" name="surcharge" typeRef="number" />
    <literalExpression id="Literal_2"><text>weight * 0.5</text></literalExpression>
  </decision>
  <inputData id="Input_1" name="Country" />
  <dmndi:DMNDI>
    <dmndi:DMNDiagram id="DRD_1">
      <dmndi:DMNShape id="Shape_Decision" dmnElementRef="Decision_1"><dc:Bounds height="80" width="180" x="160" y="80" /></dmndi:DMNShape>
      <dmndi:DMNShape id="Shape_Literal" dmnElementRef="Decision_2"><dc:Bounds height="80" width="180" x="400" y="80" /></dmndi:DMNShape>
      <dmndi:DMNShape id="Shape_Input" dmnElementRef="Input_1"><dc:Bounds height="45" width="125" x="187" y="260" /></dmndi:DMNShape>
      <dmndi:DMNEdge id="Edge_1" dmnElementRef="IR_1"><di:waypoint x="250" y="260" /><di:waypoint x="250" y="160" /></dmndi:DMNEdge>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>`;
}
