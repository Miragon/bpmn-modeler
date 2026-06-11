/**
 * Public API of the code-link feature. Sibling features resolve
 * navigate-to-implementation and route activity-sync messages only through this
 * barrel; reaching into the feature's internals is rejected by the
 * feature-isolation architecture test.
 */
export { ImplementationNavigationService, CodeLinkMapService } from "@miragon/bpmn-modeler-core";
