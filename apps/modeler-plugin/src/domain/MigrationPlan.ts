/**
 * Pure domain value object that groups discovered BPMN files by their
 * Camunda execution platform, enabling the migration command to reason
 * about which files to update.
 */

/** Describes a single BPMN file discovered in the workspace. */
export interface BpmnFileEntry {
    /** Absolute file system path. */
    readonly path: string;
    /** Raw XML content of the file. */
    readonly content: string;
    /** Detected Camunda platform (`"c7"` or `"c8"`). */
    readonly platform: "c7" | "c8";
    /** Current `modeler:executionPlatformVersion` value, or `undefined` if absent. */
    readonly version: string | undefined;
}

/** Which subset of diagrams the user wants to migrate. */
export type MigrationScope = "c7" | "c8" | "both";

/**
 * Groups BPMN files by execution platform and exposes query helpers
 * for the migration orchestration logic.
 */
export class MigrationPlan {
    /**
     * @param c7Files Files detected as Camunda 7.
     * @param c8Files Files detected as Camunda 8.
     * @param undetected Files whose platform could not be determined.
     */
    constructor(
        readonly c7Files: readonly BpmnFileEntry[],
        readonly c8Files: readonly BpmnFileEntry[],
        readonly undetected: readonly string[],
    ) {}

    /** Returns `true` if at least one Camunda 7 file was found. */
    hasC7(): boolean {
        return this.c7Files.length > 0;
    }

    /** Returns `true` if at least one Camunda 8 file was found. */
    hasC8(): boolean {
        return this.c8Files.length > 0;
    }

    /** Returns `true` if both Camunda 7 and 8 files were found. */
    hasBothPlatforms(): boolean {
        return this.hasC7() && this.hasC8();
    }

    /** Returns `true` if no classifiable BPMN files were found. */
    isEmpty(): boolean {
        return !this.hasC7() && !this.hasC8();
    }

    /**
     * Returns the number of files covered by the given scope.
     *
     * @param scope The migration scope to count.
     */
    fileCount(scope: MigrationScope): number {
        switch (scope) {
            case "c7":
                return this.c7Files.length;
            case "c8":
                return this.c8Files.length;
            case "both":
                return this.c7Files.length + this.c8Files.length;
        }
    }
}
