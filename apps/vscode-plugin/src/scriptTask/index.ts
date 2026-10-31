/**
 * Public API of the scriptTask feature; reaching into the feature's internals
 * is rejected by the feature-isolation architecture test. The script tabs
 * (`ScriptTaskService`) implement a core port, so only the composition root
 * imports them.
 */
export { ScriptTaskCommandController } from "./controller/ScriptTaskCommandController";
