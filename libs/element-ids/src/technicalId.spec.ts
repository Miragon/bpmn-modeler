import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { technicalIdFor } from "./technicalId";

// The rule bpmn-js-properties-panel applies to an ID typed into the panel.
const VALID_ID = /^[a-z_][\w-.]*$/i;

describe("technicalIdFor", () => {
    it.each<[string, string, string]>([
        ["Process data", "bpmn:UserTask", "UserTask_ProcessData"],
        ["Check order", "bpmn:ServiceTask", "ServiceTask_CheckOrder"],
        ["Check order", "bpmn:Task", "Task_CheckOrder"],
        ["Payment received", "bpmn:StartEvent", "StartEvent_PaymentReceived"],
        ["Order valid?", "bpmn:ExclusiveGateway", "ExclusiveGateway_OrderValid"],
        ["yes", "bpmn:SequenceFlow", "SequenceFlow_Yes"],
        ["Notify", "bpmn:MessageFlow", "MessageFlow_Notify"],
        ["10 days", "bpmn:BoundaryEvent", "BoundaryEvent_10Days"],
        ["Review", "bpmn:SubProcess", "SubProcess_Review"],
        ["Rate", "bpmn:CallActivity", "CallActivity_Rate"],
        ["Order fulfilment", "bpmn:Process", "Process_OrderFulfilment"],
        ["Customer", "bpmn:Participant", "Participant_Customer"],
        ["Back office", "bpmn:Lane", "Lane_BackOffice"],
        ["Invoice", "bpmn:DataObjectReference", "DataObjectReference_Invoice"],
        ["Bestand prüfen", "bpmn:Task", "Task_BestandPruefen"],
        ["Größe übernehmen", "bpmn:Task", "Task_GroesseUebernehmen"],
        ["Café crème", "bpmn:Task", "Task_CafeCreme"],
        ["Søren's læring", "bpmn:Task", "Task_SorensLaering"],
        ["follow-up e-mail", "bpmn:Task", "Task_FollowUpEMail"],
        ["check orderID", "bpmn:Task", "Task_CheckOrderID"],
        ["  lots   of\nspace ", "bpmn:Task", "Task_LotsOfSpace"],
        ["Approve (manager)", "custom:Approval", "Approval_ApproveManager"],
    ])("spells %j on a %s as %s with the type prefix", (name, type, id) => {
        expect(technicalIdFor(name, type, "typePrefix")).toBe(id);
    });

    // The Camunda Modeler plugin rename-technical-ids spells IDs this way.
    it.each<[string, string, string]>([
        ["Process data", "bpmn:UserTask", "ProcessDataTask"],
        ["Payload received", "bpmn:StartEvent", "PayloadReceivedStartEvent"],
        ["Time out", "bpmn:IntermediateCatchEvent", "TimeOutEvent"],
        ["Send reminder", "bpmn:IntermediateThrowEvent", "SendReminderEvent"],
        ["10 days", "bpmn:IntermediateCatchEvent", "N10DaysEvent"],
        ["Order valid?", "bpmn:ExclusiveGateway", "OrderValidGateway"],
        ["Join", "bpmn:InclusiveGateway", "JoinInclusiveGateway"],
        ["Order fulfilment", "bpmn:Process", "OrderFulfilmentProcess"],
        ["yes", "bpmn:SequenceFlow", "YesSequenceFlow"],
        ["Check", "bpmn:Task", "CheckTask"],
        ["Check", "bpmn:ScriptTask", "CheckTask"],
        ["Review", "bpmn:SubProcess", "ReviewSubProcess"],
        ["Done", "bpmn:EndEvent", "DoneEndEvent"],
    ])("spells %j on a %s as %s with the type suffix", (name, type, id) => {
        expect(technicalIdFor(name, type, "typeSuffix")).toBe(id);
    });

    it.each<[string, string, string]>([
        ["Process data", "bpmn:UserTask", "user_task_process_data"],
        ["check orderID", "bpmn:Task", "task_check_order_id"],
        ["IDNumber lookup", "bpmn:Task", "task_id_number_lookup"],
        ["10 days", "bpmn:BoundaryEvent", "boundary_event_10_days"],
        ["Order valid?", "bpmn:ExclusiveGateway", "exclusive_gateway_order_valid"],
        ["Invoice", "bpmn:DataObjectReference", "data_object_reference_invoice"],
    ])("spells %j on a %s as %s in snake case", (name, type, id) => {
        expect(technicalIdFor(name, type, "snakeCase")).toBe(id);
    });

    it.each(["", "   ", "???", "日本語", "—"])("has no ID for the name %j", (name) => {
        expect(technicalIdFor(name, "bpmn:Task", "typePrefix")).toBeUndefined();
    });

    it.each<ElementIdStyle>(["typePrefix", "typeSuffix", "snakeCase"])(
        "builds only IDs the properties panel accepts in the %s style",
        (style) => {
            const names = [
                "1st try",
                "a.b-c_d",
                "ÄÖÜ äöü ß",
                "x",
                "9",
                "Ünïcödé façade",
                "e = mc²",
            ];
            for (const name of names) {
                expect(technicalIdFor(name, "bpmn:Task", style)).toMatch(VALID_ID);
            }
        },
    );
});
