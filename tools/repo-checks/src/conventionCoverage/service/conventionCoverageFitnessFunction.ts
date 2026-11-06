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

export interface ConventionCoveragePorts {
    readonly sources: RoleFolderSources;
}

export function createConventionCoverageFitnessFunction({
    sources,
}: ConventionCoveragePorts): FitnessFunction {
    return defineFitnessFunction({
        id: "convention-coverage",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures:
            'Code the role-folder convention does not cover, in every workspace whose manifest declares "architecture": "hexagonal". Each rule of HEXAGONAL_RULES runs without the exceptions the blocking architecture spec grants: a file outside every role folder and not directly in src/, and a file whose imports contradict its folder, one finding per file and rule at its first offending import. A class whose implements clause names an interface declared in a port/ folder of any hexagonal workspace, sitting outside adapter/out/ and testing/, one finding per file at its first such class. Read: tracked .ts and .tsx files under each workspace\'s src/, without specs, declaration files and __fixtures__; an implemented interface is resolved through imports, barrels and the tsconfig.base.json path aliases.',
        reliesOn: {
            skill: "architecture",
            rule: "every file sits in its role folder; a class that implements a port sits in adapter/out/ or testing/",
        },
        misses: [
            "What code does: a domain/ file full of orchestration, or a service/ that decides on raw data, imports nothing the rules forbid.",
            "A structural port implementation without an implements clause, such as an object literal typed by the port or a class that only matches its shape.",
            "Kotlin, and every workspace that declares no hexagonal architecture (diagram-js and flat workspaces).",
            "Specs and __fixtures__, which are not read.",
        ],
        reportsWrongly: [
            "Counts per rule, not per file: a file breaking two rules is two findings, so the count exceeds the number of files.",
            "Workspaces not yet moved into role folders (the webviews until #2129) count nearly every file as outside a role folder.",
            "A misplaced module directly in src/ is an entry by the convention, so it shows only at its importers, under “nothing imports an entry”.",
        ],
        evidence: [
            {
                kind: "published",
                reference:
                    "Murphy, Notkin, Sullivan, Software Reflexion Models: Bridging the Gap Between Source and High-Level Models, FSE 1995; journal version Software Reflexion Models: Bridging the Gap between Design and Implementation, IEEE TSE 27(4), 2001",
            },
            {
                kind: "trial",
                commit: "773f8014",
                outcome:
                    "44 files import vscode; a file-name pattern for host adapters finds 12 of them, so the role folder, not the name, has to carry the convention",
            },
            {
                kind: "trial",
                commit: "03b31896",
                outcome:
                    "first run: 62 findings in 451 files of 9 workspaces, none in a migrated one; 42 outside every role folder (bpmn-webview 22, template builder 12, form and deployment webview 4 each), 19 divergent imports (12 entry imports in the flat webview roots, 7 template-builder domain files importing catalog/), 1 misplaced port implementation (EditorSessionDocuments); 14 testing/ fakes and 46 adapter/out/ classes implement a port and stay unreported",
            },
        ],
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
