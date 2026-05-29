/**
 * Public API of the deployment feature. Sibling features reach the deployment
 * sidebar only through this barrel; reaching into the feature's internals is
 * rejected by the feature-isolation architecture test.
 */
export { DeploymentController } from "./controller/DeploymentController";
