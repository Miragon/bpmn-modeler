/// <reference types="vite/client" />

// Models: Miragon/cibseven-developer-training-exercises, solutions/exercise-9.
// They chain: newsletter's Call Activity → membership-rejection, whose Business
// Rule Task → categorize-applicant — which is what the demo navigation resolves.
import newsletterXml from "../models/newsletter.bpmn?raw";
import membershipRejectionXml from "../models/membership-rejection.bpmn?raw";
import categorizeApplicantXml from "../models/categorize-applicant.dmn?raw";

export type ModelType = "bpmn" | "dmn";

export interface DemoModel {
    id: string;
    title: string;
    type: ModelType;
    engine: "c7";
    xml: string;
    processId?: string; // BPMN: Call Activity target (calledElement)
    decisionId?: string; // DMN: Business Rule Task target (decisionRef)
}

export const MODELS: DemoModel[] = [
    {
        id: "newsletter",
        title: "Newsletter Subscription",
        type: "bpmn",
        engine: "c7",
        xml: newsletterXml,
        processId: "subscribeNewsletter",
    },
    {
        id: "membership-rejection",
        title: "Membership Rejection",
        type: "bpmn",
        engine: "c7",
        xml: membershipRejectionXml,
        processId: "handleRejection",
    },
    {
        id: "categorize-applicant",
        title: "Categorize Applicant",
        type: "dmn",
        engine: "c7",
        xml: categorizeApplicantXml,
        decisionId: "categorizeApplicant",
    },
];

function getModelById(id: string | null | undefined): DemoModel | undefined {
    return id ? MODELS.find((m) => m.id === id) : undefined;
}

// Falls back to the first model of the page's type when ?model= is absent or
// names a model of the other type (a bpmn page must not render a dmn model).
export function getActiveModel(pageType: ModelType): DemoModel {
    const requested = getModelById(new URLSearchParams(window.location.search).get("model"));
    if (requested && requested.type === pageType) {
        return requested;
    }
    return MODELS.find((m) => m.type === pageType) ?? MODELS[0];
}

export function resolveReference(
    referenceId: string,
    referenceKind: "process" | "decision",
): DemoModel | undefined {
    if (referenceKind === "process") {
        return MODELS.find((m) => m.type === "bpmn" && m.processId === referenceId);
    }
    return MODELS.find((m) => m.type === "dmn" && m.decisionId === referenceId);
}

export function modelHref(model: DemoModel): string {
    return `/${model.type}/?model=${encodeURIComponent(model.id)}`;
}
