import type { AddOnAboutPayload } from "@miragon/bpmn-modeler-shared";

/** The README, license and stars of one add-on or source, as the host sent them. */
export interface AboutShown {
    readonly targetId: string;
    readonly about: AddOnAboutPayload;
}

/** What the view last asked about, so it asks again only for another target or model. */
export interface AboutAsked {
    readonly targetId: string;
    readonly revision: number;
}

export interface AboutRequest {
    readonly askAbout: string;
    readonly aboutAsked: AboutAsked;
    /** What stays shown while the answer is on its way: only the same target's. */
    readonly about?: AboutShown;
}

/** An answer for an earlier selection arrives too late to show. */
export function aboutOnArrival(
    selectedId: string | undefined,
    current: AboutShown | undefined,
    arrived: AboutShown,
): AboutShown | undefined {
    return arrived.targetId === selectedId ? arrived : current;
}

/**
 * Asks about what the detail shows, and again once a new model lists it, as
 * a rebuild follows a change in its folder. A view without a detail asks for
 * none.
 */
export function aboutRequestOf(view: {
    readonly revision: number | undefined;
    readonly selectedId: string | undefined;
    readonly showsDetail: boolean;
    readonly about: AboutShown | undefined;
    readonly aboutAsked: AboutAsked | undefined;
}): AboutRequest | undefined {
    const { revision, selectedId, showsDetail, about, aboutAsked } = view;
    if (revision === undefined || selectedId === undefined || !showsDetail) return undefined;
    if (aboutAsked?.targetId === selectedId && aboutAsked.revision === revision) return undefined;
    return {
        askAbout: selectedId,
        aboutAsked: { targetId: selectedId, revision },
        ...(about?.targetId === selectedId && { about }),
    };
}
