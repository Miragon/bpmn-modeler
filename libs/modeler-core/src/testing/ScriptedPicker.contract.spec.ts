import { ChoicePrompt } from "../kernel/domain/prompts";
import { describePickerContract } from "./pickerContract";
import { ScriptedPicker } from "./ScriptedPicker";

describePickerContract("ScriptedPicker", async () => {
    const answers: Record<string, unknown> = {};
    const picker = new ScriptedPicker(answers);
    return {
        picker,
        userPicks: (prompt, row) => {
            answers[prompt.id] = prompt.items[row].value;
        },
        userChecks: (prompt, rows) => {
            answers[prompt.id] = rows.map((row) => prompt.items[row].value);
        },
        userDismisses: (prompt) => {
            delete answers[prompt.id];
        },
        userConfirms: (request) => {
            answers[request.id] = true;
        },
        userDeclines: (request) => {
            answers[request.id] = false;
        },
        shownLabels: () => {
            const [prompt] = picker.prompts[picker.prompts.length - 1].args as [
                ChoicePrompt<unknown>,
            ];
            return prompt.items.map((item) => item.label);
        },
    };
});
