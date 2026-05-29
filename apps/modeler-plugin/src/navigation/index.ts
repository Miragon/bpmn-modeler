/**
 * Public API of the navigation feature. Sibling features resolve
 * navigate-to-referenced-model only through this barrel; reaching into the
 * feature's internals is rejected by the feature-isolation architecture test.
 */
export { ModelNavigationService } from "./service/ModelNavigationService";
