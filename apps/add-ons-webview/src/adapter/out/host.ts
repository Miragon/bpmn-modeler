import {
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    AddOnsViewCommand,
    asProtocolMessage,
    type BrandMode,
    BrandModeQuery,
    brandModeOf,
    HostApiImpl,
    type HostColorThemeKind,
    MockHostApi,
    Query,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import type { PersistedChoices } from "../../domain/viewState";
import type { AddOnsHost } from "../../port/addOnsHost";
import { MockCatalog, previewStateOf } from "./mockCatalog";

declare const process: { env: { NODE_ENV: string } };

/** The preview's stand-in host in `development`; the embedding host's channel in every other build. */
export function getHostApi(): AddOnsHost {
    if (process.env.NODE_ENV === "development") {
        return new MockHost(new URLSearchParams(window.location.search));
    }
    return new HostApiImpl();
}

const PREVIEW_HOST_THEMES: Readonly<Record<string, HostColorThemeKind>> = {
    dark: "dark",
    hc: "highContrast",
};

/**
 * Answers the view's commands from {@link MockCatalog}. Query flags:
 * `state=loading|empty|noFolder|onlyMarketplaces|noMarketplace|marketplacesFailed|rereadFailed|failed|allReviewed`,
 * `reveal=<add-on id or name>`, `preset=needsReview` (Review Add-ons, after any reveal),
 * `stale=1` (the first allow is refused as stale) and `theme=dark|hc`.
 */
class MockHost extends MockHostApi<PersistedChoices, AddOnsViewCommand> {
    private readonly catalog: MockCatalog;
    private readonly revealed?: string;
    private readonly reviewPreset: boolean;
    private readonly brandMode: BrandMode;

    constructor(flags: URLSearchParams) {
        super();
        this.catalog = new MockCatalog(previewStateOf(flags.get("state")), { stale: flags.get("stale") === "1" });
        this.revealed = flags.get("reveal") ?? undefined;
        this.reviewPreset = flags.get("preset") === "needsReview";
        const theme = flags.get("theme") ?? "";
        this.brandMode = brandModeOf(PREVIEW_HOST_THEMES[theme] ?? "light", "automatic");
    }

    override postMessage(message: AddOnsViewCommand): void {
        const command = asProtocolMessage(message);
        switch (command.type) {
            case "LogInfoCommand":
            case "LogErrorCommand":
                console.debug(`[add-ons preview] ${command.type}`, command.message);
                return;
            case "GetAddOnCatalogCommand":
                // The preview has no host shell to carry the mode, so it arrives as a theme change would.
                dispatch(new BrandModeQuery(this.brandMode));
                this.postModel();
                this.postReveal();
                return;
            case "AddOnRequestCommand": {
                const { result, changed } = this.catalog.act(command.request);
                dispatch(new AddOnActionResultQuery(command.requestId, result));
                if (changed) this.postModel();
                return;
            }
            default:
                throw new Error(`Unknown message type: ${message.type}`);
        }
    }

    private postModel(): void {
        const model = this.catalog.model();
        if (model !== undefined) dispatch(new AddOnCatalogQuery(model));
    }

    private postReveal(): void {
        const id = this.revealed === undefined ? undefined : this.catalog.idOf(this.revealed);
        if (id !== undefined) dispatch(new RevealAddOnsQuery({ kind: "rows", revealId: 1, addOnIds: [id] }));
        if (this.reviewPreset) dispatch(new RevealAddOnsQuery({ kind: "needsReview", revealId: 2 }));
    }
}

function dispatch(query: Query): void {
    window.dispatchEvent(new MessageEvent("message", { data: query }));
}
