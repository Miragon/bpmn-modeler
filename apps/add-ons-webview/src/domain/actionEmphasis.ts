import type { AddOnActionKindPayload, SourceActionKindPayload } from "@miragon/bpmn-modeler-shared";

/** How much a button stands out: the step that asks for trust leads, one that takes it back warns. */
export type Emphasis = "primary" | "secondary" | "ghost" | "danger";

const ADD_ON_EMPHASIS: Readonly<Record<AddOnActionKindPayload, Emphasis>> = {
    allow: "primary",
    revoke: "danger",
    enable: "secondary",
    disable: "secondary",
};

const SOURCE_EMPHASIS: Readonly<Record<SourceActionKindPayload, Emphasis>> = {
    removeMarketplace: "danger",
    enableTemplates: "ghost",
    disableTemplates: "ghost",
};

export function addOnActionEmphasis(kind: AddOnActionKindPayload): Emphasis {
    return ADD_ON_EMPHASIS[kind];
}

export function sourceActionEmphasis(kind: SourceActionKindPayload): Emphasis {
    return SOURCE_EMPHASIS[kind];
}
