import { PREVIEW_LOG_PREFIX } from "./previewCommandTable";

/** The mode a preview URL's `?mode=` names; the first mode is the default, and an unknown one warns. */
export function previewModeOf<TMode extends string>(
    search: string,
    modes: readonly [TMode, ...TMode[]],
): TMode {
    const raw = new URLSearchParams(search).get("mode");
    const mode = modes.find((candidate) => candidate === raw);
    if (mode) {
        return mode;
    }
    if (raw !== null && raw !== "") {
        console.warn(
            `${PREVIEW_LOG_PREFIX} Unknown ?mode=${raw}; falling back to "${modes[0]}". ` +
                `Known values: ${modes.join(", ")}.`,
        );
    }
    return modes[0];
}
