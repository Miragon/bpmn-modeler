import { ScriptedTokenPrompt } from "./InMemoryCredentials";
import { describeTokenPromptContract } from "./tokenPromptContract";

describeTokenPromptContract("ScriptedTokenPrompt", async () => {
    const answers: Record<string, string> = {};
    return {
        tokenPrompt: new ScriptedTokenPrompt(answers),
        userTypes: (prompt, text) => {
            answers[prompt.host] = text;
        },
        userDismisses: (prompt) => {
            delete answers[prompt.host];
        },
    };
});
