import { FrontendApplicationContribution } from "@theia/core/lib/browser";
import { CommandRegistry } from "@theia/core/lib/common/command";
import TheiaURI from "@theia/core/lib/common/uri";
import { inject, injectable } from "@theia/core/shared/inversify";
import { URI } from "@theia/core/shared/vscode-uri";
import { EditorManager } from "@theia/editor/lib/browser";

const OPEN_WITH_COMMAND = "vscode.openWith";
const DEFAULT_EDITOR = "default";
const VIEW_COLUMN_BESIDE = -2;
const MODELER_EXTENSIONS = [".bpmn", ".dmn"];

/**
 * Forces modeler source files into Theia's text editor when explicitly requested.
 *
 * Theia 1.73 routes `vscode.openWith(..., "default")` through its generic opener,
 * where the configured BPMN/DMN custom editor wins again. Registering after the
 * regular command contributions gives this narrow compatibility handler priority.
 */
@injectable()
export class StandardTextEditorContribution implements FrontendApplicationContribution {
    @inject(CommandRegistry)
    protected readonly commands!: CommandRegistry;

    @inject(EditorManager)
    protected readonly editorManager!: EditorManager;

    onStart(): void {
        this.commands.registerHandler(OPEN_WITH_COMMAND, {
            isEnabled: (resource: unknown, viewType: unknown, columnOrOptions: unknown) =>
                this.isModelerSourceRequest(resource, viewType, columnOrOptions),
            execute: async (resource: URI) => {
                await this.editorManager.openToSide(new TheiaURI(resource.toString()));
            },
        });
    }

    private isModelerSourceRequest(
        resource: unknown,
        viewType: unknown,
        columnOrOptions: unknown,
    ): resource is URI {
        return (
            URI.isUri(resource) &&
            typeof viewType === "string" &&
            viewType.toLowerCase() === DEFAULT_EDITOR &&
            columnOrOptions === VIEW_COLUMN_BESIDE &&
            MODELER_EXTENSIONS.some((extension) => resource.path.toLowerCase().endsWith(extension))
        );
    }
}
