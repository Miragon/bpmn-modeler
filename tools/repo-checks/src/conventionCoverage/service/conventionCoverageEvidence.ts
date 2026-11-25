import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const CONVENTION_COVERAGE_EVIDENCE = [
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
    {
        kind: "trial",
        commit: "69ecc374",
        outcome:
            "Version 2 against version 1: 0 findings both and the same files read; no hexagonal workspace holds a __tests__, test or tests folder under src/. The blocking architecture spec's readSourceTree skips the same folders, so both read the same files.",
    },
    {
        kind: "trial",
        commit: "c65c2776",
        outcome:
            "Version 3 against version 2, port-implementation rows: 3 → 0 at c65c2776, the three canvas manager classes of packages/bpmn-modeler that only kernel/service/viewState.ts builds and no service takes as a parameter; the other groups unchanged. Of the 45 port classes that a service of their workspace builds or receives, the 42 driven ones are each received by a service as a parameter typed by the port, the 3 managers by none. No class in adapter/out/ or testing/ is built by a service of its workspace, so the construction condition alone decides every row; the parameter condition is pinned only by specs, not yet by real code. Of the 123 classes that implement a port, the 120 in adapter/out/ and testing/ are built in composition/, adapter/out/ or testing/, or only in specs. The squash commits of the last 30 PRs that changed a port/ file and their parents (59 trees, 781d9bb6 to c65c2776): only c65c2776 changes; EditorSessionDocuments implementing the core's DocumentPort in service/, built in composition/ and testing/, stays reported in all 20 trees that hold it. Counting a parameter default that builds the class as receipt, whatever the parameter's type, changes no row at c65c2776.",
    },
] as const satisfies EvidenceList;
