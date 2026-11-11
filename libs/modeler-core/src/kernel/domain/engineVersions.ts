import { Engine, getVersions } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "./prompts";
import { engineVersionChoicePrompt } from "./engineVersionChoicePrompt";

export {
    C7_VERSIONS,
    C8_VERSIONS,
    getLatestVersion,
    getVersions,
} from "@miragon/bpmn-modeler-types";

export function engineVersionPrompt(platform: Engine): ChoicePrompt<string> {
    // One id per engine: migrating both engines asks for both versions in one run.
    return engineVersionChoicePrompt(platform, getVersions(platform), `${platform}EngineVersion`);
}
