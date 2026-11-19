import {
    type AddOnsPage,
    addOnsPageOf,
    type BrandMode,
    brandModeOf,
    type HostColorThemeKind,
} from "@miragon/bpmn-modeler-shared";

import { type PreviewState, previewStateOf } from "./mockCatalog";

/** What the preview's URL asks of its host. */
export interface PreviewFlags {
    readonly page: AddOnsPage;
    readonly state: PreviewState;
    readonly stale: boolean;
    readonly brandMode: BrandMode;
    readonly shown?: string;
    readonly revealed?: string;
    readonly reviewPreset: boolean;
}

const PREVIEW_HOST_THEMES: Readonly<Record<string, HostColorThemeKind>> = {
    dark: "dark",
    hc: "highContrast",
};

/**
 * Reads the query flags
 * `state=loading|empty|noFolder|onlyMarketplaces|noMarketplace|marketplacesFailed|rereadFailed|failed|allReviewed`,
 * `reveal=<add-on id or name>`, `preset=needsReview` (Review Add-ons, after any reveal),
 * `stale=1` (the first allow is refused as stale), `theme=dark|hc`,
 * `page=listWithTab|detail` (which page a host serves) and `show=<add-on id or name>` (a detail page's add-on).
 */
export function previewFlagsOf(flags: URLSearchParams): PreviewFlags {
    return {
        page: addOnsPageOf(flags.get("page") ?? undefined),
        state: previewStateOf(flags.get("state")),
        stale: flags.get("stale") === "1",
        brandMode: brandModeOf(PREVIEW_HOST_THEMES[flags.get("theme") ?? ""] ?? "light", "automatic"),
        shown: flags.get("show") ?? undefined,
        revealed: flags.get("reveal") ?? undefined,
        reviewPreset: flags.get("preset") === "needsReview",
    };
}
