import { commands, ExtensionContext, TabInputCustom, TabInputText, Uri, window } from "vscode";

import { LoggerPort, MergeViewOpener } from "@miragon/bpmn-modeler-core";

export const OPEN_BPMN_MERGE_VIEW = "bpmn-modeler.openBpmnMergeView";

/** What the command receives: a Source Control row, an editor title's file, or nothing from the palette. */
type MergeCommandArgument = Uri | { readonly resourceUri?: Uri } | undefined;

/**
 * "Resolve in BPMN Merge View": hands the file the command names to the
 * core's {@link MergeViewOpener}, which decides whether the view opens and
 * explains a file it cannot open.
 */
export class MergeController {
    constructor(
        private readonly opener: Pick<MergeViewOpener, "open">,
        private readonly logger: LoggerPort,
    ) {}

    register(context: ExtensionContext): void {
        context.subscriptions.push(
            commands.registerCommand(OPEN_BPMN_MERGE_VIEW, (argument?: MergeCommandArgument) =>
                this.open(argument),
            ),
        );
    }

    private async open(argument: MergeCommandArgument): Promise<void> {
        try {
            await this.opener.open(fileUriOf(argument)?.toString());
        } catch (error) {
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
        }
    }
}

function fileUriOf(argument: MergeCommandArgument): Uri | undefined {
    if (argument instanceof Uri) return argument;
    if (argument?.resourceUri) return argument.resourceUri;
    const input = window.tabGroups.activeTabGroup.activeTab?.input;
    return input instanceof TabInputCustom || input instanceof TabInputText ? input.uri : undefined;
}
