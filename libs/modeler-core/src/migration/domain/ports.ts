import { MigrationScope } from "./MigrationPlan";

/** The migration command's own prompt, beside the cross-cutting `PickerPort`. */
export interface MigrationPickerPort {
    /** @throws {UserCancelledError} on dismissal. */
    pickMigrationScope(c7Count: number, c8Count: number): Promise<MigrationScope>;
}
