import { Engine } from "@miragon/bpmn-modeler-types";

import { BpmnDocument } from "../../kernel/domain/BpmnDocument";

/** Which subset of diagrams the user wants to migrate. */
export type MigrationScope = Engine | "both";

/** A workspace diagram with the content it has when the migration is planned. */
export interface MigrationCandidate {
    readonly path: string;
    readonly document: BpmnDocument;
}

export type ScopeDecision =
    | { readonly kind: "nothingToMigrate" }
    | { readonly kind: "fixed"; readonly scope: Engine }
    | { readonly kind: "ask"; readonly c7Count: number; readonly c8Count: number };

/** The version picked for each engine in scope. */
export type MigrationVersions = Partial<Record<Engine, string>>;

export type DiagramWrite =
    | { readonly kind: "engineChanged" }
    | { readonly kind: "unchanged" }
    | { readonly kind: "write"; readonly xml: string; readonly stampedPlatform: boolean };

const ENGINES: readonly Engine[] = ["c7", "c8"];

export function enginesIn(scope: MigrationScope): readonly Engine[] {
    return scope === "both" ? ENGINES : [scope];
}

/** A planned diagram and the version picked for the engine it was planned under. */
export class PlannedWrite {
    constructor(
        readonly path: string,
        readonly engine: Engine,
        readonly version: string,
    ) {}

    /**
     * The diagram may have been edited while the versions were picked, so its
     * write derives from the content it has when written, not when planned.
     */
    writeFrom(current: BpmnDocument): DiagramWrite {
        if (current.detectEngine() !== this.engine) {
            return { kind: "engineChanged" };
        }
        const migration = current.migratedTo(this.engine, this.version);
        if (migration.kind === "unchanged") {
            return migration;
        }
        return {
            kind: "write",
            xml: migration.document.xml,
            stampedPlatform: migration.kind === "platformStamped",
        };
    }
}

/** Every candidate lands under exactly one engine or among the undetected paths. */
export class MigrationPlan {
    private constructor(
        private readonly pathsByEngine: Readonly<Record<Engine, readonly string[]>>,
        readonly undetected: readonly string[],
    ) {}

    static classify(candidates: readonly MigrationCandidate[]): MigrationPlan {
        const pathsByEngine: Record<Engine, string[]> = { c7: [], c8: [] };
        const undetected: string[] = [];
        for (const { path, document } of candidates) {
            const engine = document.detectEngine();
            if (engine === undefined) {
                undetected.push(path);
            } else {
                pathsByEngine[engine].push(path);
            }
        }
        return new MigrationPlan(pathsByEngine, undetected);
    }

    scopeDecision(): ScopeDecision {
        const c7Count = this.pathsByEngine.c7.length;
        const c8Count = this.pathsByEngine.c8.length;
        if (c7Count > 0 && c8Count > 0) {
            return { kind: "ask", c7Count, c8Count };
        }
        if (c7Count > 0) {
            return { kind: "fixed", scope: "c7" };
        }
        if (c8Count > 0) {
            return { kind: "fixed", scope: "c8" };
        }
        return { kind: "nothingToMigrate" };
    }

    writesFor(versions: MigrationVersions): readonly PlannedWrite[] {
        return ENGINES.flatMap((engine) => {
            const version = versions[engine];
            return version === undefined
                ? []
                : this.pathsByEngine[engine].map((path) => new PlannedWrite(path, engine, version));
        });
    }
}
