import { TokenPromptPort } from "@miragon/bpmn-modeler-core";
import { window } from "vscode";

/**
 * Adapter over VS Code's input box for entering a personal access token.
 *
 * `ignoreFocusOut: true` is load-bearing — the user switches to a browser to
 * mint the PAT, and without it the box would dismiss and silently cancel.
 * Empty/whitespace maps to `undefined` (a decline): an empty token would
 * suppress every future prompt while authenticating nothing.
 */
export class VsCodeTokenPrompt implements TokenPromptPort {
    async promptForToken(host: string, reason: string): Promise<string | undefined> {
        const value = await window.showInputBox({
            title: `Personal Access Token for ${host}`,
            prompt: reason,
            password: true,
            ignoreFocusOut: true,
        });
        const trimmed = value?.trim();
        return trimmed ? trimmed : undefined;
    }
}
