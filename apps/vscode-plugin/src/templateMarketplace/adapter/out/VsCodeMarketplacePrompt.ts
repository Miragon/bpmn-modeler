import {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
    MarketplacePromptPort,
} from "@miragon/bpmn-modeler-core";
import { window } from "vscode";

/**
 * Asks in steps: the location in an input box, which runs the core's check as
 * the user types and so accepts only a location the core registers, then the
 * scope in a quick pick when the core offers a choice. `invalidLocation` is
 * not shown on its own: VS Code runs `validateInput` on the initial value too.
 */
export class VsCodeMarketplacePrompt implements MarketplacePromptPort {
    async promptForMarketplace(prompt: MarketplaceAddPrompt): Promise<MarketplaceAddAnswer | undefined> {
        const location = await window.showInputBox({
            title: prompt.title,
            prompt: prompt.prompt,
            placeHolder: prompt.placeholder,
            value: prompt.location,
            validateInput: prompt.problemWith,
        });
        if (location === undefined) return undefined;
        if (prompt.scopes.length === 0) return { location, scope: prompt.scope };

        const picked = await window.showQuickPick(
            prompt.scopes.map(({ scope, label, description }) => ({ label, description, scope })),
            { title: prompt.title },
        );
        return picked && { location, scope: picked.scope };
    }
}
