import { naming } from "@miragon/bpmnlint-plugin-rules";
import { describe, expect, it } from "vitest";

import { FALLBACK_CONVENTION } from "./convention";
import { bpmn as moddle } from "./__fixtures__/moddle";
import { technicalIdFor } from "./technicalId";

const element = (type: string, attrs: Record<string, unknown> = {}) => moddle.create(type, attrs);
const miragon = new naming.ElementIdConvention();

type ConventionConfig = ConstructorParameters<typeof naming.ElementIdConvention>[0];

// The rule bpmn-js-properties-panel applies to an ID typed into the panel.
const VALID_ID = /^[a-z_][\w-.]*$/i;

/** What the lint rule itself says about an element carrying `id`. */
function violation(
    convention: InstanceType<typeof naming.ElementIdConvention>,
    node: object,
    id: string,
) {
    return convention.violationOf(Object.assign(Object.create(node), { id }));
}

describe("technicalIdFor", () => {
    it.each<[string, string, string]>([
        ["Check order", "bpmn:ServiceTask", "serviceTask_checkOrder"],
        ["Process data", "bpmn:UserTask", "userTask_processData"],
        ["Check order", "bpmn:Task", "task_checkOrder"],
        ["Payment received", "bpmn:StartEvent", "startEvent_paymentReceived"],
        ["Order shipped", "bpmn:EndEvent", "endEvent_orderShipped"],
        ["Reminder", "bpmn:IntermediateThrowEvent", "event_reminder"],
        ["10 days", "bpmn:BoundaryEvent", "event_n10Days"],
        ["Order valid?", "bpmn:ExclusiveGateway", "gateway_orderValid"],
        ["Join", "bpmn:ParallelGateway", "gateway_join"],
        ["yes", "bpmn:SequenceFlow", "flow_yes"],
        ["Notify", "bpmn:MessageFlow", "messageFlow_notify"],
        ["Review", "bpmn:SubProcess", "subProcess_review"],
        ["Review", "bpmn:Transaction", "subProcess_review"],
        ["Rate", "bpmn:CallActivity", "callActivity_rate"],
        ["Customer", "bpmn:Participant", "participant_customer"],
        ["Back office", "bpmn:Lane", "lane_backOffice"],
        ["Invoice", "bpmn:DataObjectReference", "dataObject_invoice"],
        ["Archive", "bpmn:DataStoreReference", "dataStore_archive"],
        ["Bestand prüfen", "bpmn:Task", "task_bestandPruefen"],
        ["Größe übernehmen", "bpmn:Task", "task_groesseUebernehmen"],
        ["Café crème", "bpmn:Task", "task_cafeCreme"],
        ["Søren's læring", "bpmn:Task", "task_sorensLaering"],
        ["follow-up e-mail", "bpmn:Task", "task_followUpEMail"],
        ["check orderID", "bpmn:Task", "task_checkOrderId"],
        ["IDNumber lookup", "bpmn:Task", "task_idNumberLookup"],
        ["  lots   of\nspace ", "bpmn:Task", "task_lotsOfSpace"],
    ])("spells %j on a %s as %s, as the Miragon convention asks", (name, type, id) => {
        const node = element(type);

        expect(technicalIdFor(name, node, miragon)).toBe(id);
        expect(violation(miragon, node, id)).toBeNull();
    });

    it("leaves the type prefix off a process, whose ID the convention does not check", () => {
        expect(technicalIdFor("Order fulfilment", element("bpmn:Process"), miragon)).toBe(
            "orderFulfilment",
        );
    });

    it.each<[ConventionConfig, string, string, string]>([
        [{ case: "PascalCase" }, "Check order", "bpmn:ServiceTask", "serviceTask_CheckOrder"],
        [{ case: "snake_case" }, "Check orderID", "bpmn:ServiceTask", "serviceTask_check_order_id"],
        [{ case: "kebab-case" }, "Check order", "bpmn:ServiceTask", "serviceTask_check-order"],
        [{ case: "any" }, "Check order", "bpmn:Task", "task_checkOrder"],
        [{ case: "PascalCase" }, "10 days", "bpmn:BoundaryEvent", "event_N10Days"],
        [{ case: "snake_case" }, "10 days", "bpmn:BoundaryEvent", "event_10_days"],
        [{ prefixes: { "bpmn:SequenceFlow": "Flow_" } }, "yes", "bpmn:SequenceFlow", "Flow_yes"],
        [{ prefixes: { "bpmn:ScriptTask": false } }, "Run script", "bpmn:ScriptTask", "runScript"],
    ])("follows a configured convention %j: %j on a %s is %s", (config, name, type, id) => {
        const convention = new naming.ElementIdConvention(config);
        const node = element(type);

        expect(technicalIdFor(name, node, convention)).toBe(id);
        expect(violation(convention, node, id)).toBeNull();
    });

    it("names the event definition when the convention requires it", () => {
        const convention = new naming.ElementIdConvention({ eventDefinitionQualifier: "required" });
        const start = element("bpmn:StartEvent", {
            eventDefinitions: [element("bpmn:MessageEventDefinition")],
        });

        expect(technicalIdFor("Order received", start, convention)).toBe(
            "messageStartEvent_orderReceived",
        );
        expect(technicalIdFor("Order received", start, miragon)).toBe("startEvent_orderReceived");
    });

    it("starts an unprefixed ID with a letter", () => {
        const snake = new naming.ElementIdConvention({ case: "snake_case" });

        expect(technicalIdFor("2024 audit", element("bpmn:Process"), snake)).toBe("n2024_audit");
    });

    it.each<[string, string, string]>([
        ["Check order", "bpmn:ServiceTask", "serviceTask_checkOrder"],
        ["Order valid?", "bpmn:ExclusiveGateway", "exclusiveGateway_orderValid"],
        ["Order fulfilment", "bpmn:Process", "orderFulfilment"],
    ])("without a convention from the host, spells %j on a %s as %s", (name, type, id) => {
        expect(technicalIdFor(name, { $type: type }, FALLBACK_CONVENTION)).toBe(id);
    });

    it.each(["", "   ", "???", "日本語", "—"])("has no ID for the name %j", (name) => {
        expect(technicalIdFor(name, element("bpmn:Task"), miragon)).toBeUndefined();
    });

    it.each<string>(["camelCase", "PascalCase", "snake_case", "kebab-case", "any"])(
        "builds only IDs the properties panel and the rule accept in %s",
        (namingCase) => {
            const convention = new naming.ElementIdConvention({ case: namingCase });
            const names = [
                "1st try",
                "a.b-c_d",
                "ÄÖÜ äöü ß",
                "x",
                "9",
                "Ünïcödé façade",
                "e = mc²",
            ];
            for (const type of ["bpmn:Task", "bpmn:Process", "bpmn:StartEvent"]) {
                const node = element(type);
                for (const name of names) {
                    const id = technicalIdFor(name, node, convention)!;
                    expect(id).toMatch(VALID_ID);
                    expect(violation(convention, node, id)).toBeNull();
                }
            }
        },
    );
});
