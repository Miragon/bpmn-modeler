import type { PickerPort, WorkspacePort } from "../../shared/domain/hostPorts";
import type { ReferencedModelLocator } from "./ReferencedModelLocator";

export type FormPreviewResult =
    { kind: "loaded"; content: string } | { kind: "unavailable"; message: string };

export class FormPreviewService {
    constructor(
        private readonly locator: ReferencedModelLocator,
        private readonly workspace: WorkspacePort,
        private readonly picker: PickerPort,
    ) {}

    async read(id: string, sourcePath: string): Promise<FormPreviewResult> {
        try {
            const { outcome, chosen } = await this.picker.searchAndPickReferencedModel(
                "Select a form to preview…",
                () => this.locator.findDeclaringFiles(id, "form", sourcePath),
            );
            if (outcome.kind !== "matches" || outcome.paths.length === 0) {
                return {
                    kind: "unavailable",
                    message: "No readable local form matches this reference.",
                };
            }
            const path = outcome.paths.length === 1 ? outcome.paths[0] : chosen;
            if (!path || !outcome.paths.includes(path)) {
                return { kind: "unavailable", message: "Form preview cancelled." };
            }
            return { kind: "loaded", content: await this.workspace.readFile(path) };
        } catch {
            return {
                kind: "unavailable",
                message: "The saved form could not be read. Try refreshing the preview.",
            };
        }
    }
}
