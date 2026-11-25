import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import {
    CONVENTION_COVERAGE_GROUPS,
    conventionCoverageFindings,
} from "../domain/conventionCoverageFindings";
import type { RoleFolderSources } from "../port/RoleFolderSources";
import { CONVENTION_COVERAGE_EVIDENCE } from "./conventionCoverageEvidence";

export interface ConventionCoveragePorts {
    readonly sources: RoleFolderSources;
}

export function createConventionCoverageFitnessFunction({
    sources,
}: ConventionCoveragePorts): FitnessFunction {
    return defineFitnessFunction({
        id: "convention-coverage",
        version: 3,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures:
            'Code the role-folder convention does not cover, in every workspace whose manifest declares "architecture": "hexagonal". Each rule of HEXAGONAL_RULES runs without the exceptions the blocking architecture spec grants: a file outside every role folder and not directly in src/, and a file whose imports contradict its folder, one finding per file and rule at its first offending import. A class whose implements clause names an interface declared in a port/ folder of any hexagonal workspace, sitting outside adapter/out/ and testing/, one finding per file at its first such class. A class that only services of its own workspace build with new, implementing only ports that workspace declares, and that no service of the workspace takes as a parameter typed by one of them or builds as a parameter\'s default, is a driving port, a handle the workspace hands out to a host, and is not reported; a class built anywhere else in a hexagonal workspace, or nowhere outside specs, or whose port a service receives, or that a service builds as a parameter\'s default however the parameter is typed or left untyped, implements a port a host or composition supplies. Read: tracked .ts, .tsx, .mts and .cts files under each workspace\'s src/, without specs, declaration files and files in a __fixtures__, __tests__, test or tests folder; an implemented interface and a constructed class are resolved through imports, barrels and the tsconfig.base.json path aliases.',
        reliesOn: {
            skill: "architecture",
            rule: "every file sits in its role folder; a class that implements a port sits in adapter/out/ or testing/, unless it is a handle only its own services build and none receives",
        },
        misses: [
            "What code does: a domain/ file full of orchestration, or a service/ that decides on raw data, imports nothing the rules forbid.",
            "A structural port implementation without an implements clause, such as an object literal typed by the port or a class that only matches its shape.",
            "Kotlin, and every workspace that declares no hexagonal architecture (diagram-js and flat workspaces).",
            "Specs and test folders, which are not read.",
            "A driven port's implementation that only services of its own workspace build, that no service receives as a parameter typed by the port and that no parameter's default builds: such as a field a service initializes itself (private readonly store = new FileStore()), a module-level singleton in service/, a default a service builds for a member of an options parameter whose own interface names the port, or a parameter typed by a related type with the class built elsewhere (reader?: Reader, then reader ?? new FileStore()), where the related type is the port's base interface, an alias of the port, an indexed access, an import() type or a type parameter constrained by the port. It reads as a driving port.",
            "A re-export renaming a name (export { A as B }): a construction of the class under the new name, and a parameter typed by the port under its new name, are not seen, so a class its services build that the composition also builds, or whose port a service receives, under such a name reads as a driving port.",
            "A construction in a workspace that declares no hexagonal architecture, such as a flat host app: a class its own services build and such a workspace builds too reads as a driving port.",
        ],
        reportsWrongly: [
            "Counts per rule, not per file: a file breaking two rules is two findings, so the count exceeds the number of files.",
            "A misplaced module directly in src/ is an entry by the convention, so it shows only at its importers, under “nothing imports an entry”.",
            "A driving handle that a composition, an entry, the test kit or an inbound adapter builds, such as a surface class a preset constructs, or whose port a service of its workspace takes as a parameter, reads as a supplied port and is reported.",
        ],
        evidence: CONVENTION_COVERAGE_EVIDENCE,
        groups: CONVENTION_COVERAGE_GROUPS,
        findFindings: ({ repoRoot }) => {
            const workspaces = sources.read(repoRoot);
            if (workspaces.length === 0) {
                throw new InsufficientHistory(
                    'no workspace manifest declares "architecture": "hexagonal"',
                );
            }
            return conventionCoverageFindings(workspaces);
        },
    });
}
