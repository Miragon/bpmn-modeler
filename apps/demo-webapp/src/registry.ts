/// <reference types="vite/client" />

import { detectEngine, type DetectedEngine, type ReferenceKind } from "@miragon/bpmn-modeler";

// Models: Miragon/cibseven-developer-training-exercises, solutions/exercise-9.
// They chain: newsletter's Call Activity → membership-rejection, whose Business
// Rule Task → categorize-applicant — which is what the demo navigation resolves.
// `onboarding-draft` is the untagged outlier: no `modeler:executionPlatform`, so
// `detectEngine` returns undefined and the mode strip starts it in Design with
// Implement greyed out.
import newsletterXml from "../models/newsletter.bpmn?raw";
import membershipRejectionXml from "../models/membership-rejection.bpmn?raw";
import categorizeApplicantXml from "../models/categorize-applicant.dmn?raw";
import onboardingDraftXml from "../models/onboarding-draft.bpmn?raw";

export type ModelType = "bpmn" | "dmn";

export interface DemoModel {
    id: string;
    title: string;
    type: ModelType;
    // Detected from the XML's execution-platform metadata — `undefined` for an
    // engine-neutral (untagged) diagram, which the mode strip reads as Design-only.
    engine: DetectedEngine;
    xml: string;
    processId?: string; // BPMN: Call Activity target (calledElement)
    decisionId?: string; // DMN: Business Rule Task target (decisionRef)
}

// Derives `engine` from the XML so the registry stays the single source of truth
// for a model's execution platform — no hand-maintained engine field to drift
// from the diagram it describes.
function defineModel(model: Omit<DemoModel, "engine">): DemoModel {
    return { ...model, engine: detectEngine(model.xml) };
}

export const MODELS: DemoModel[] = [
    defineModel({
        id: "newsletter",
        title: "Newsletter Subscription",
        type: "bpmn",
        xml: newsletterXml,
        processId: "subscribeNewsletter",
    }),
    defineModel({
        id: "membership-rejection",
        title: "Membership Rejection",
        type: "bpmn",
        xml: membershipRejectionXml,
        processId: "handleRejection",
    }),
    defineModel({
        id: "onboarding-draft",
        title: "Onboarding (Draft)",
        type: "bpmn",
        xml: onboardingDraftXml,
        processId: "onboardingDraft",
    }),
    defineModel({
        id: "categorize-applicant",
        title: "Categorize Applicant",
        type: "dmn",
        xml: categorizeApplicantXml,
        decisionId: "categorizeApplicant",
    }),
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

// Resolves a context-pad reference to a registry model. `process` → a bpmn model
// by its process id, `decision` → a dmn model by its decision id; every other
// kind (e.g. `form`, which the demo does not host) resolves to nothing.
export function resolveReference(
    referenceId: string,
    referenceKind: ReferenceKind,
): DemoModel | undefined {
    if (referenceKind === "process") {
        return MODELS.find((m) => m.type === "bpmn" && m.processId === referenceId);
    }
    if (referenceKind === "decision") {
        return MODELS.find((m) => m.type === "dmn" && m.decisionId === referenceId);
    }
    return undefined;
}

export function modelHref(model: DemoModel): string {
    return `/${model.type}/?model=${encodeURIComponent(model.id)}`;
}
