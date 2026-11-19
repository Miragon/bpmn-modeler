/** What a card's choice does: open the merge editor again, resend dropping the merges by hand, or close the card. */
export type MergeCardAction = "editAgain" | "dropHandMerges" | "dismiss";

/** A worded button of the card, the first one primary. */
export interface MergeCardChoice {
    readonly action: MergeCardAction;
    readonly text: string;
    readonly primary?: true;
}

/** An element the card names, as a link that shows it. */
interface MergeOutcomeCardLink {
    readonly elementId: string;
    readonly name: string;
}

/** What the outcome card at an element says; the adapter only renders it. */
export interface MergeOutcomeCardContent {
    readonly applied: boolean;
    /** Neither taken nor refused: a merge closed without a save, or a question. */
    readonly notice?: true;
    readonly elementId: string;
    readonly headline: string;
    /** What the decision pulled in, dropped and opened again. */
    readonly rows: readonly {
        readonly label: string;
        readonly links: readonly MergeOutcomeCardLink[];
    }[];
    readonly reasons: readonly string[];
    readonly moreReasons?: string;
    /** What blocks a refusal, which the canvas marks while the card shows. */
    readonly blockers: readonly string[];
    readonly offer?: { readonly elementId: string; readonly text: string };
    readonly unblocked?: { readonly elementId: string; readonly text: string };
    readonly choices?: readonly MergeCardChoice[];
    /** The lines a screen reader announces once, when the outcome arrives. */
    readonly announcement: readonly string[];
}

/** How the card reads: taken, refused, or neither, such as a question; only a refusal is an alert. */
export type MergeCardTone = "applied" | "refused" | "notice";

export function cardToneOf(
    content: Pick<MergeOutcomeCardContent, "applied" | "notice">,
): MergeCardTone {
    if (content.applied) return "applied";
    return content.notice ? "notice" : "refused";
}

/** The card says it all but the offer, which is a control, not news. */
export function withAnnouncement(
    content: Omit<MergeOutcomeCardContent, "announcement">,
): MergeOutcomeCardContent {
    const announcement = [
        content.headline,
        ...content.rows.map(
            ({ label, links }) => `${label} ${links.map(({ name }) => name).join(", ")}`,
        ),
        ...content.reasons,
        content.moreReasons,
        content.unblocked?.text,
    ].filter((line): line is string => line !== undefined);
    return { ...content, announcement };
}
