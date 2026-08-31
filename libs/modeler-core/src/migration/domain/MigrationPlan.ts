/**
 * Pure domain value object that groups discovered BPMN files by their
 * Camunda execution platform, enabling the migration command to reason
 * about which files to update.
 */

import { Engine } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../shared/domain/BpmnDocument";

/**
 * Describes a single BPMN file discovered in the workspace.
 */
export interface BpmnFileEntry {
    // Absolute file system path.
    readonly path: string;
    // BPMN document wrapping the raw XML content.
    readonly document: BpmnDocument;
    // Detected Camunda platform (`"c7"` or `"c8"`).
    readonly platform: Engine;
}

/**
 * Which subset of diagrams the user wants to migrate.
 */
export type MigrationScope = Engine | "both";

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

    hasC7(): boolean {
        return this.c7Files.length > 0;
    }

    hasC8(): boolean {
        return this.c8Files.length > 0;
    }

    hasBothPlatforms(): boolean {
        return this.hasC7() && this.hasC8();
    }

    isEmpty(): boolean {
        return !this.hasC7() && !this.hasC8();
    }

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
