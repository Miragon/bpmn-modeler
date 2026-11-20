import {
    AddOnAboutQuery,
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    type AddOnsViewCommandType,
    BrandModeQuery,
    type MessageOfType,
    type PreviewCommandTable,
    type Query,
    RevealAddOnsQuery,
    ShowAddOnQuery,
} from "@miragon/bpmn-modeler-shared";

import { mockAboutOf } from "./mockAbout";
import type { MockCatalog } from "./mockCatalog";
import type { PreviewFlags } from "./previewFlags";

/** The preview a command arrives in, and the way back to the view. */
export interface PreviewSession {
    readonly flags: PreviewFlags;
    readonly catalog: MockCatalog;
    /** An answer the preview cannot give passes undefined and sends nothing. */
    reply(query: Query | undefined): void;
}

export const PREVIEW_COMMANDS: PreviewCommandTable<AddOnsViewCommandType, PreviewSession> = {
    LogInfoCommand: logToConsole,
    LogErrorCommand: logToConsole,
    GetAddOnCatalogCommand: (_, preview) => answerCatalogRequest(preview),
    AddOnRequestCommand: ({ requestId, request }, preview) => {
        const { result, changed } = preview.catalog.act(request);
        preview.reply(new AddOnActionResultQuery(requestId, result));
        if (changed) preview.reply(catalogQueryOf(preview.catalog));
    },
    OpenAddOnDetailCommand: { ignored: "the preview has no host to open a detail tab in" },
    GetAddOnAboutCommand: ({ targetId }, preview) =>
        preview.reply(new AddOnAboutQuery(targetId, mockAboutOf(targetId))),
};

export const PREVIEW_LOG_PREFIX = "[add-ons preview]";

function logToConsole({ type, message }: MessageOfType<"LogInfoCommand" | "LogErrorCommand">): void {
    console.debug(`${PREVIEW_LOG_PREFIX} ${type}`, message);
}

function answerCatalogRequest(preview: PreviewSession): void {
    // The preview has no host shell to carry the mode, so it arrives as a theme change would.
    preview.reply(new BrandModeQuery(preview.flags.brandMode));
    preview.reply(showQueryOf(preview));
    preview.reply(catalogQueryOf(preview.catalog));
    preview.reply(revealQueryOf(preview));
    preview.reply(reviewPresetQueryOf(preview.flags));
}

function showQueryOf({ flags, catalog }: PreviewSession): ShowAddOnQuery | undefined {
    const id = catalog.idOf(flags.shown);
    return id === undefined ? undefined : new ShowAddOnQuery(id);
}

function catalogQueryOf(catalog: MockCatalog): AddOnCatalogQuery | undefined {
    const model = catalog.model();
    return model === undefined ? undefined : new AddOnCatalogQuery(model);
}

function revealQueryOf({ flags, catalog }: PreviewSession): RevealAddOnsQuery | undefined {
    const id = catalog.idOf(flags.revealed);
    return id === undefined ? undefined : new RevealAddOnsQuery({ kind: "rows", revealId: 1, addOnIds: [id] });
}

function reviewPresetQueryOf(flags: PreviewFlags): RevealAddOnsQuery | undefined {
    return flags.reviewPreset ? new RevealAddOnsQuery({ kind: "needsReview", revealId: 2 }) : undefined;
}
