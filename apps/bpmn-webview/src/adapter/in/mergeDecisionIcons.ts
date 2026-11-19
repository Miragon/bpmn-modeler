import type { MergePadEntry } from "@miragon/bpmn-modeler-shared";

import { padIconSvg } from "./padIcon";

/** A pen: the element's XML merged by hand, on the pad's entry and on the badge it leaves. */
export const PEN_PATHS = `<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>`;

export const MERGE_DECISION_ICONS: Readonly<Record<MergePadEntry, string>> = {
    keep: padIconSvg(`<path d="M20 6 9 17l-5-5"/>`),
    keepInside: padIconSvg(
        `<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m16 9-5.5 6L8 12.5"/>`,
    ),
    leaveOut: padIconSvg(`<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>`),
    // An arrow and a plus: what was removed with the element comes back.
    keepRemovedWith: padIconSvg(
        `<path d="M3 12h10"/><path d="m10 8 4 4-4 4"/><path d="M19 9v6"/><path d="M16 12h6"/>`,
    ),
    mergeXml: padIconSvg(PEN_PATHS),
    undo: padIconSvg(`<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>`),
};
