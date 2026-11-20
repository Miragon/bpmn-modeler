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
] as const satisfies EvidenceList;
