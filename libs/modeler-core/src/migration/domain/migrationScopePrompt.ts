import { ENGINE_LABEL } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "../../kernel/domain/prompts";
import { MigrationScope } from "./MigrationPlan";

export function migrationScopePrompt({
    c7Count,
    c8Count,
}: {
    readonly c7Count: number;
    readonly c8Count: number;
}): ChoicePrompt<MigrationScope> {
    return {
        id: "migrationScope",
        placeholder: "Which diagrams do you want to migrate?",
        items: [
            { label: `${ENGINE_LABEL.c7} only (${diagramCount(c7Count)})`, value: "c7" },
            { label: `${ENGINE_LABEL.c8} only (${diagramCount(c8Count)})`, value: "c8" },
            { label: `Both (${diagramCount(c7Count + c8Count)})`, value: "both" },
        ],
    };
}

function diagramCount(count: number): string {
    return count === 1 ? "1 diagram" : `${count} diagrams`;
}
