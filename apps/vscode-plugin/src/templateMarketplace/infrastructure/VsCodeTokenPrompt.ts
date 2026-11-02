import { TokenPrompt, TokenPromptPort } from "@miragon/bpmn-modeler-core";
import { window } from "vscode";

/**
 * `ignoreFocusOut: true` is load-bearing — the user switches to a browser to
 * mint the PAT, and without it the box would dismiss and silently cancel.
 */
export class VsCodeTokenPrompt implements TokenPromptPort {
    async promptForToken(prompt: TokenPrompt): Promise<string | undefined> {
        return window.showInputBox({
            title: prompt.title,
            prompt: prompt.prompt,
            password: prompt.password,
            ignoreFocusOut: true,
        });
    }
}
