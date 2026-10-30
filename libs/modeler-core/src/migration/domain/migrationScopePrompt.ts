import { ChoicePrompt } from "../../kernel/domain/prompts";
import { MigrationScope } from "./MigrationPlan";

export function migrationScopePrompt(_counts: {
    readonly c7Count: number;
    readonly c8Count: number;
}): ChoicePrompt<MigrationScope> {
    return { id: "", placeholder: "", items: [] };
}
