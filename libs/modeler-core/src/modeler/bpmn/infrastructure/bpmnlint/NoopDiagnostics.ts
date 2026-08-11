import { LintResults } from "@miragon/bpmn-modeler-shared";

import { DiagnosticsPort } from "../../../../shared/domain/hostPorts";

/**
 * A {@link DiagnosticsPort} that drops findings on the floor, for hosts with no
 * Problems-panel equivalent (the IntelliJ bridge). Lint overlays still render in
 * the webview; only the host-native diagnostics surface is absent.
 */
export class NoopDiagnostics implements DiagnosticsPort {
    publish(_documentUri: string, _xml: string, _results: LintResults): void {
        // no host diagnostics surface
    }

    clear(_documentUri: string): void {
        // no host diagnostics surface
    }
}
