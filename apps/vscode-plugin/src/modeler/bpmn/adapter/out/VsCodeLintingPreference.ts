import { LintingPreferencePort } from "@miragon/bpmn-modeler-core";

import { setLintingEnabled as storeLintingEnabled } from "../../../../shared/adapter/out/modelerConfiguration";

/** The user's linting switch in VS Code's user settings. */
export class VsCodeLintingPreference implements LintingPreferencePort {
    async setLintingEnabled(enabled: boolean): Promise<void> {
        await storeLintingEnabled(enabled);
    }
}
