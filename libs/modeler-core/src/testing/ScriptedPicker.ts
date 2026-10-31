import { PickerPort } from "../kernel/domain/hostPorts";
import { ChoicePrompt, ConfirmRequest, SearchPrompt } from "../kernel/domain/prompts";

/** Scripted answers to the prompts, keyed by prompt id. */
export type PromptAnswers = Readonly<Record<string, unknown>>;

export interface Prompt {
    readonly method: keyof PickerPort;
    readonly args: readonly unknown[];
}

/**
 * Answers each prompt from `promptAnswers` by its id. An unanswered prompt is
 * dismissed (`undefined`, `[]` or `false`), so a test exercises the caller's
 * cancel path by leaving it out. A search's choice is answered by the id of the
 * choice prompt it reveals. A scripted answer the prompt does not offer throws,
 * so a test cannot pass with a choice the user was never shown.
 */
export class ScriptedPicker implements PickerPort {
    readonly prompts: Prompt[] = [];

    constructor(readonly promptAnswers: PromptAnswers = {}) {}

    async choose<V>(prompt: ChoicePrompt<V>): Promise<V | undefined> {
        this.prompts.push({ method: "choose", args: [prompt] });
        return this.chosenValue(prompt);
    }

    async chooseMany<V>(prompt: ChoicePrompt<V>): Promise<readonly V[]> {
        this.prompts.push({ method: "chooseMany", args: [prompt] });
        const answer = this.promptAnswers[prompt.id];
        if (answer === undefined) {
            return [];
        }
        if (!Array.isArray(answer)) {
            throw notAnAnswer(prompt.id, answer);
        }
        return answer.map((value) => offeredValue(prompt, value));
    }

    async confirm(request: ConfirmRequest): Promise<boolean> {
        this.prompts.push({ method: "confirm", args: [request] });
        const answer = this.promptAnswers[request.id] ?? false;
        if (typeof answer !== "boolean") {
            throw notAnAnswer(request.id, answer);
        }
        return answer;
    }

    async searchAndChoose<R>(search: SearchPrompt<R>): Promise<{ outcome: R; chosen?: string }> {
        this.prompts.push({ method: "searchAndChoose", args: [search] });
        const outcome = await search.search();
        const choices = search.choices(outcome);
        return { outcome, chosen: choices && this.chosenValue(choices) };
    }

    private chosenValue<V>(prompt: ChoicePrompt<V>): V | undefined {
        const answer = this.promptAnswers[prompt.id];
        return answer === undefined ? undefined : offeredValue(prompt, answer);
    }
}

function offeredValue<V>(prompt: ChoicePrompt<V>, answer: unknown): V {
    const offered = prompt.items.find((item) => item.value === answer);
    if (!offered) {
        throw notAnAnswer(prompt.id, answer);
    }
    return offered.value;
}

function notAnAnswer(promptId: string, answer: unknown): Error {
    return new Error(`${JSON.stringify(answer)} is not an answer to prompt "${promptId}"`);
}
