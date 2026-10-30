import type { FormPreviewResult } from "@miragon/bpmn-modeler-types";
import type { NotifierPort, PickerPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { classifyLocateResult } from "../../kernel/domain/locateResult";
import type { ReferencedModelLocator } from "./ReferencedModelLocator";

export class FormPreviewService {
    constructor(
        private readonly locator: ReferencedModelLocator,
        private readonly workspace: WorkspacePort,
        private readonly picker: PickerPort,
        private readonly notifier: NotifierPort,
    ) {}

    async read(id: string, sourcePath: string, automatic = false): Promise<FormPreviewResult> {
        try {
            const { outcome, chosen } = automatic
                ? {
                      outcome: await this.locator.findDeclaringFiles(id, "form", sourcePath),
                      chosen: undefined,
                  }
                : await this.picker.searchAndPickLocatedFile(
                      {
                          searchingPlaceholder: "Searching for a form to preview…",
                          pickPlaceholder: "Select a form to preview…",
                      },
                      () => this.locator.findDeclaringFiles(id, "form", sourcePath),
                  );
            const located = classifyLocateResult(outcome);
            if (located.kind === "noScope") return { kind: "unavailable", reason: "noScope" };
            if (located.kind === "unreadable") {
                located.failures.forEach((message) => this.notifier.logWarning(message));
                return { kind: "unavailable", reason: "unreadable" };
            }
            located.readFailures.forEach((message) => this.notifier.logWarning(message));
            if (located.kind === "notFound") return { kind: "unavailable", reason: "notFound" };
            if (located.kind === "ambiguous" && automatic) {
                this.notifier.logInfo("Automatic form preview skipped: multiple matching forms.");
                return { kind: "unavailable", reason: "ambiguous" };
            }
            const path = located.kind === "single" ? located.path : chosen;
            if (!path || (located.kind === "ambiguous" && !located.paths.includes(path)))
                return { kind: "cancelled" };
            return { kind: "loaded", content: await this.workspace.readFile(path) };
        } catch (error) {
            this.notifier.logError(error as Error);
            return { kind: "unavailable", reason: "unreadable" };
        }
    }
}
