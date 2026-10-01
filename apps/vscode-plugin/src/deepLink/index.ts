/**
 * Public API of the deep-link feature. Sibling features and the composition
 * root reach it only through this barrel; the feature-isolation architecture
 * test rejects imports of its internals.
 */
export { DeepLinkController } from "./controller/DeepLinkController";
