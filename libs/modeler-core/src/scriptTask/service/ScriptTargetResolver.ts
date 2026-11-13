import { UpdateScriptFormatQuery } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { LoggerPort, PickerPort } from "../../kernel/port/hostPorts";
import { InlineScript } from "../domain/inlineScript";
import { ScriptLanguage, scriptLanguagePrompt } from "../domain/scriptLanguage";
import { ScriptUri } from "../domain/ScriptUri";

/** The file an inline script is written to, and the language its tab shows. */
export interface ScriptTarget {
    readonly uri: ScriptUri;
    readonly language: ScriptLanguage;
}

/**
 * Decides which file an inline script gets. A script in a language the model
 * lacks or the modeler does not support asks the user for one, and the pick is
 * written back to the model so the next open does not ask again.
 */
export class ScriptTargetResolver {
    constructor(
        private readonly store: EditorSessionStore,
        private readonly picker: PickerPort,
        private readonly logger: LoggerPort,
    ) {}

    /** `undefined` when the user dismisses the language prompt. */
    async resolve(editorId: string, script: InlineScript): Promise<ScriptTarget | undefined> {
        const scriptFormat = await this.supportedFormatOf(editorId, script);
        if (scriptFormat === undefined) {
            return undefined;
        }
        const language = new ScriptLanguage(scriptFormat);
        const { elementId, kind, listenerIndex, eventName } = script;
        return {
            uri: new ScriptUri(
                editorId,
                elementId,
                kind,
                listenerIndex,
                eventName,
                language.extension,
            ),
            language,
        };
    }

    private async supportedFormatOf(
        editorId: string,
        script: InlineScript,
    ): Promise<string | undefined> {
        if (ScriptLanguage.isSupported(script.scriptFormat)) {
            return script.scriptFormat;
        }
        const picked = await this.picker.choose(scriptLanguagePrompt(script.scriptFormat));
        if (picked !== undefined) {
            await this.writeFormatToModel(editorId, script, picked);
        }
        return picked;
    }

    private async writeFormatToModel(
        editorId: string,
        { elementId, kind, listenerIndex }: InlineScript,
        scriptFormat: string,
    ): Promise<void> {
        try {
            await this.store.postMessage(
                editorId,
                new UpdateScriptFormatQuery(elementId, kind, listenerIndex, scriptFormat),
            );
        } catch (error) {
            this.logger.logError(error as Error);
        }
    }
}
