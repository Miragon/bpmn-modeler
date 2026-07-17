/**
 * Public API of the scriptTask feature. Sibling features import the inline
 * script-editor service only through this barrel; reaching into the feature's
 * internals is rejected by the feature-isolation architecture test.
 */
export { ScriptTaskService } from "./controller/ScriptTaskService";
export { ScriptTaskCommandController } from "./controller/ScriptTaskCommandController";
