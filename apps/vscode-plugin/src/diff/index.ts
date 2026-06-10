/**
 * Public API of the diff feature. Sibling features drive diff panes only
 * through this barrel; reaching into the feature's internals is rejected by the
 * feature-isolation architecture test.
 */
export { BpmnDiffController } from "./controller/BpmnDiffController";
