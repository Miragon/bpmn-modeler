import { ENGINE_LABEL, Engine, getVersions } from "@miragon/bpmn-modeler-types";

import { ChoicePrompt } from "./prompts";

export {
    C7_VERSIONS,
    C8_VERSIONS,
    getLatestVersion,
    getVersions,
} from "@miragon/bpmn-modeler-types";

export function engineVersionPrompt(platform: Engine): ChoicePrompt<string> {
    return {
        id: "engineVersion",
        placeholder: `Select ${ENGINE_LABEL[platform]} engine version`,
        items: getVersions(platform).map((version) => ({ label: version, value: version })),
    };
}
