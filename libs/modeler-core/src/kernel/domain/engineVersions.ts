import { Engine } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "./prompts";

export {
    C7_VERSIONS,
    C8_VERSIONS,
    getLatestVersion,
    getVersions,
} from "@miragon/bpmn-modeler-types";

export function engineVersionPrompt(_platform: Engine): ChoicePrompt<string> {
    return { id: "", placeholder: "", items: [] };
}
