/**
 * Public API of the migration feature. Sibling features trigger engine-version
 * migration only through this barrel; reaching into the feature's internals is
 * rejected by the feature-isolation architecture test.
 */
export { BpmnMigrationService } from "./service/BpmnMigrationService";
