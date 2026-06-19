/**
 * Public API of the DMN modeler feature. Sibling features use the modeler
 * service only through this barrel; reaching into the feature's internals is
 * rejected by the feature-isolation architecture test.
 */
export { DmnModelerService } from "@miragon/bpmn-modeler-core";
export { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
