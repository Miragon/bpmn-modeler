import {
    ADD_ONS_PAGE_ATTRIBUTE,
    type AddOnsViewCommand,
    MockHostApi,
    replyToWebview,
    routePreviewCommand,
} from "@miragon/bpmn-modeler-shared";

import type { PersistedChoices } from "../../../domain/viewState";
import { MockCatalog } from "./mockCatalog";
import { PREVIEW_COMMANDS, PREVIEW_LOG_PREFIX, type PreviewSession } from "./previewCommands";
import { previewFlagsOf } from "./previewFlags";

/**
 * The browser preview's host: answers the view's commands from {@link MockCatalog}, as the
 * table in `previewCommands.ts` routes them, in the state the URL's flags ({@link previewFlagsOf}) select.
 */
export class PreviewHost extends MockHostApi<PersistedChoices, AddOnsViewCommand> {
    private readonly session: PreviewSession;

    constructor(search: URLSearchParams) {
        super();
        const flags = previewFlagsOf(search);
        // A host writes the page into its shell; the preview has none, so it writes it before the bootstrap reads it.
        document.documentElement.setAttribute(ADD_ONS_PAGE_ATTRIBUTE, flags.page);
        this.session = { flags, catalog: new MockCatalog(flags.state, { stale: flags.stale }), reply: replyToWebview };
    }

    override postMessage(message: AddOnsViewCommand): void {
        routePreviewCommand(PREVIEW_COMMANDS, message, this.session, PREVIEW_LOG_PREFIX);
    }
}
