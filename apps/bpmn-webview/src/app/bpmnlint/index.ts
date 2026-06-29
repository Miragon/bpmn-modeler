/**
 * Self-contained bpmn-js DI module for in-canvas bpmnlint linting.
 *
 * Pulls in `bpmn-js-bpmnlint` (the linter + its in-canvas button/overlays) and
 * its stylesheet, and registers two services: {@link LintConfigSanitizerService} (filters a
 * raw `.bpmnlintrc` to the current scope's built-in-rules allow-list) and {@link LintConfigService}
 * (applies the sanitised config to the linter at runtime). Drop {@link LintModule}
 * into the modeler's `additionalModules` like any other module; the host's config
 * is delivered later via the `bpmnLintConfig` service. The static resolver is an
 * internal detail the service owns.
 */
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint.css";

import { LintConfigSanitizerService } from "./LintConfigSanitizerService";
import { LintConfigService } from "./LintConfigService";

const LintModule = {
    __depends__: [bpmnLintingModule],
    bpmnLintConfig: ["type", LintConfigService],
    bpmnLintSanitizer: ["type", LintConfigSanitizerService],
};

export default LintModule;
export { LintConfigService } from "./LintConfigService";
