import {
    AddOnAboutQuery,
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    type AddOnsViewCommand,
    type AddOnsViewCommandType,
    BrandModeQuery,
    type MessageOfType,
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

/** What the preview does with a command, or why it drops it. */
export type PreviewRoute<TType extends AddOnsViewCommandType> =
    | ((command: MessageOfType<TType>, preview: PreviewSession) => void)
    | { readonly ignored: string };

/** A row per command of the view: a command without one fails to compile. */
type PreviewCommandTable = {
    readonly [TType in AddOnsViewCommandType]: PreviewRoute<TType>;
};

const PREVIEW_COMMANDS: PreviewCommandTable = {
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

/** The row of a command type; a type without one, an inherited object member's included, throws. */
export function previewRouteOf(type: string): PreviewRoute<AddOnsViewCommandType> {
    if (!Object.hasOwn(PREVIEW_COMMANDS, type)) {
        throw new Error(`Unknown message type: ${type}`);
    }
    return PREVIEW_COMMANDS[type as AddOnsViewCommandType] as PreviewRoute<AddOnsViewCommandType>;
}

export function routePreviewCommand(command: AddOnsViewCommand, preview: PreviewSession): void {
    const route = previewRouteOf(command.type);
    if ("ignored" in route) {
        console.debug(`[add-ons preview] ${command.type} ignored: ${route.ignored}`, command);
        return;
    }
    // Sound because the table hands each row only commands of its own key's type.
    (route as (command: AddOnsViewCommand, preview: PreviewSession) => void)(command, preview);
}

function logToConsole({ type, message }: MessageOfType<"LogInfoCommand" | "LogErrorCommand">): void {
    console.debug(`[add-ons preview] ${type}`, message);
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
