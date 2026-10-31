import { LintingPreferencePort } from "@miragon/bpmn-modeler-core";

import {
    lintingEnabled,
    setLintingEnabled as storeLintingEnabled,
} from "../../../shared/infrastructure/modelerConfiguration";

/** The user's linting switch in VS Code's user settings. */
export class VsCodeLintingPreference implements LintingPreferencePort {
    // VS Code fires no configuration change for an unchanged value, so the
    // editor has to hear that nothing changed to push the lint state itself.
    async setLintingEnabled(enabled: boolean): Promise<boolean> {
        if (lintingEnabled() === enabled) {
            return false;
        }
        await storeLintingEnabled(enabled);
        return true;
    }
}
