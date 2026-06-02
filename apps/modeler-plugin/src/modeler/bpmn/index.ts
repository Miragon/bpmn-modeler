/**
 * Public API of the BPMN modeler feature. Sibling features use the modeler
 * service only through this barrel; reaching into the feature's internals is
 * rejected by the feature-isolation architecture test.
 */
export { BpmnModelerService } from "./service/BpmnModelerService";
