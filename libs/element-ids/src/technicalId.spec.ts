import type { ElementIdStyle } from "@miragon/bpmn-modeler-types";
import { describe, expect, it } from "vitest";

import { technicalIdFor } from "./technicalId";

// The rule bpmn-js-properties-panel applies to an ID typed into the panel.
const VALID_ID = /^[a-z_][\w-.]*$/i;

describe("technicalIdFor", () => {
    it.each<[string, string, string]>([
        ["Process data", "bpmn:UserTask", "Activity_ProcessData"],
        ["Payment received", "bpmn:StartEvent", "Event_PaymentReceived"],
        ["Order valid?", "bpmn:ExclusiveGateway", "Gateway_OrderValid"],
        ["yes", "bpmn:SequenceFlow", "Flow_Yes"],
        ["Notify", "bpmn:MessageFlow", "Flow_Notify"],
        ["10 days", "bpmn:BoundaryEvent", "Event_10Days"],
        ["Review", "bpmn:SubProcess", "Activity_Review"],
        ["Rate", "bpmn:CallActivity", "Activity_Rate"],
        ["Order fulfilment", "bpmn:Process", "Process_OrderFulfilment"],
        ["Customer", "bpmn:Participant", "Participant_Customer"],
        ["Back office", "bpmn:Lane", "Lane_BackOffice"],
        ["Invoice", "bpmn:DataObjectReference", "DataObjectReference_Invoice"],
        ["Bestand prüfen", "bpmn:Task", "Activity_BestandPruefen"],
        ["Größe übernehmen", "bpmn:Task", "Activity_GroesseUebernehmen"],
        ["Café crème", "bpmn:Task", "Activity_CafeCreme"],
        ["Søren's læring", "bpmn:Task", "Activity_SorensLaering"],
        ["follow-up e-mail", "bpmn:Task", "Activity_FollowUpEMail"],
        ["check orderID", "bpmn:Task", "Activity_CheckOrderID"],
        ["  lots   of\nspace ", "bpmn:Task", "Activity_LotsOfSpace"],
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
        ["Process data", "bpmn:UserTask", "activity_process_data"],
        ["check orderID", "bpmn:Task", "activity_check_order_id"],
        ["IDNumber lookup", "bpmn:Task", "activity_id_number_lookup"],
        ["10 days", "bpmn:BoundaryEvent", "event_10_days"],
        ["Order valid?", "bpmn:ExclusiveGateway", "gateway_order_valid"],
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
