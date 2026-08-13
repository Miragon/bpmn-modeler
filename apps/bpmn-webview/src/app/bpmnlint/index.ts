/**
 * Self-contained bpmn-js DI module for in-canvas bpmnlint overlays.
 *
 * Pulls in `bpmn-js-bpmnlint` (the linter's in-canvas button + overlays) and its
 * stylesheet, and registers {@link LintConfigService}, which renders the
 * host-computed lint results. The linter itself now runs in the extension host
 * (so it can resolve custom `bpmnlint-plugin-*` rules against the workspace); the
 * webview only paints overlays. Drop {@link LintModule} into the modeler's
 * `additionalModules` like any other module; the host's results arrive later via
 * the `bpmnLintConfig` service.
 */
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint.css";

import { LintConfigService } from "./LintConfigService";

const LintModule = {
    __depends__: [bpmnLintingModule],
    bpmnLintConfig: ["type", LintConfigService],
};

export default LintModule;
export { LintConfigService } from "./LintConfigService";
