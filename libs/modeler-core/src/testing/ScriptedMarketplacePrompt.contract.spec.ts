import { ScriptedMarketplacePrompt } from "./InMemoryMarketplaceRegistrations";
import { describeMarketplacePromptContract } from "./marketplacePromptContract";

describeMarketplacePromptContract("ScriptedMarketplacePrompt", async () => {
    const prompt = new ScriptedMarketplacePrompt();
    return {
        prompt,
        replyToNext: async (question, reply) => {
            if ("dismisses" in reply) return;
            prompt.answers.push({ location: reply.enters, scope: reply.picks ?? question.scope });
        },
        shown: () => {
            const asked = prompt.prompts[prompt.prompts.length - 1];
            return {
                title: asked.title,
                prompt: asked.prompt,
                placeholder: asked.placeholder,
                location: asked.location,
                refusal: asked.invalidLocation,
                scopes: asked.scopes.map(({ label, description }) => ({ label, description })),
            };
        },
    };
});
