import { describe, expect, it } from "vitest";

import { UpdateScriptFormatQuery } from "@miragon/bpmn-modeler-shared";

import { createTestHost } from "../../testing/createTestHost";
import { InlineScript } from "../domain/inlineScript";
import { ScriptLanguage, scriptLanguagePrompt } from "../domain/scriptLanguage";
import { ScriptUri } from "../domain/ScriptUri";
import { ScriptTargetResolver } from "./ScriptTargetResolver";

const LANGUAGE_PROMPT = scriptLanguagePrompt("").id;

const startListener: InlineScript = {
    elementId: "Task_1",
    kind: "execution-listener",
    listenerIndex: 1,
    eventName: "start",
    scriptFormat: "groovy",
    content: "started = true",
};

function createResolver(languageAnswer?: string) {
    const host = createTestHost({
        promptAnswers: languageAnswer === undefined ? {} : { [LANGUAGE_PROMPT]: languageAnswer },
    });
    const diagram = host.openEditor("/ws/order.bpmn");
    const resolver = new ScriptTargetResolver(host.store, host.picker, host.notifier);
    return { host, diagram, resolver };
}

function listenerUri(editorId: string, extension: string): ScriptUri {
    return new ScriptUri(editorId, "Task_1", "execution-listener", 1, "start", extension);
}

describe("ScriptTargetResolver", () => {
    it.each(["groovy", " JavaScript "])(
        "takes the model's language %j without asking or touching the model",
        async (scriptFormat) => {
            const { host, diagram, resolver } = createResolver();

            const target = await resolver.resolve(diagram.id, { ...startListener, scriptFormat });

            const language = new ScriptLanguage(scriptFormat);
            expect(target).toEqual({ uri: listenerUri(diagram.id, language.extension), language });
            expect(host.picker.prompts).toEqual([]);
            expect(diagram.posted).toEqual([]);
        },
    );

    it.each(["", "kotlin"])(
        "asks for a language when the model's is %j, and writes the pick back to the model",
        async (scriptFormat) => {
            const { host, diagram, resolver } = createResolver("python");

            const target = await resolver.resolve(diagram.id, { ...startListener, scriptFormat });

            expect(host.picker.prompts).toEqual([
                { method: "choose", args: [scriptLanguagePrompt(scriptFormat)] },
            ]);
            expect(target).toEqual({
                uri: listenerUri(diagram.id, "py"),
                language: new ScriptLanguage("python"),
            });
            expect(diagram.posted).toEqual([
                new UpdateScriptFormatQuery("Task_1", "execution-listener", 1, "python"),
            ]);
        },
    );

    it("resolves nothing and leaves the model alone when the prompt is dismissed", async () => {
        const { diagram, resolver } = createResolver();

        await expect(
            resolver.resolve(diagram.id, { ...startListener, scriptFormat: "" }),
        ).resolves.toBeUndefined();
        expect(diagram.posted).toEqual([]);
    });

    it("logs a pick the model cannot take and still resolves the picked language", async () => {
        const { host, diagram, resolver } = createResolver("ruby");
        diagram.hidden = true;

        const target = await resolver.resolve(diagram.id, { ...startListener, scriptFormat: "" });

        expect(target?.language).toEqual(new ScriptLanguage("ruby"));
        expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual([
            "The active editor is hidden.",
        ]);
    });
});
