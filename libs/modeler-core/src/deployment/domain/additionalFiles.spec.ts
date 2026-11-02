import { describe, expect, it } from "vitest";

import { globToRegExp } from "../../kernel/domain/globToRegExp";
import { ADDITIONAL_FILES_GLOB, additionalFilesExclude } from "./additionalFiles";

function offers(path: string, configFolder: string): boolean {
    return (
        globToRegExp(ADDITIONAL_FILES_GLOB).test(path) &&
        !globToRegExp(additionalFilesExclude(configFolder)).test(path)
    );
}

describe("additional files", () => {
    it.each([
        { path: "forms/order.form", configFolder: ".camunda", offered: true },
        { path: "payloads/vars.json", configFolder: ".camunda", offered: true },
        { path: "decisions/discount.dmn", configFolder: ".camunda", offered: true },
        { path: "processes/order.bpmn", configFolder: ".camunda", offered: false },
        { path: ".camunda/deployment-targets.json", configFolder: ".camunda", offered: false },
        { path: "camunda/deployment-targets.json", configFolder: "camunda", offered: false },
        { path: "camunda/code-link/order.bpmn.json", configFolder: "camunda", offered: false },
        { path: "processes/camunda/payloads/a.json", configFolder: "camunda", offered: false },
        { path: "camunda/deployment-targets.json", configFolder: ".camunda", offered: true },
        { path: "my-camunda/vars.json", configFolder: "camunda", offered: true },
        { path: "config/camunda/payloads/a.json", configFolder: "config/camunda", offered: false },
        { path: "camunda/forms/order.form", configFolder: "config/camunda", offered: true },
        { path: "templates/element-templates/task.json", configFolder: ".camunda", offered: false },
        { path: "node_modules/pkg/package.json", configFolder: "camunda", offered: false },
        { path: "target/classes/discount.dmn", configFolder: "camunda", offered: false },
        { path: ".vscode/settings.json", configFolder: "camunda", offered: false },
    ])(
        "offers $path with the config folder $configFolder: $offered",
        ({ path, configFolder, offered }) => {
            expect(offers(path, configFolder)).toBe(offered);
        },
    );
});
