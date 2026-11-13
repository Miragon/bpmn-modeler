/** Every approval notice offers only this; the list opens from it. */
export type ApprovalNoticeAction = "review";

/** What "Review…" answered: the ids the user checked, or the pending code left to a view. */
export type ReviewAnswer =
    | { readonly kind: "checked"; readonly ids: readonly string[] }
    | { readonly kind: "leftForView" };

/** What a session remembers of an answer about one allowance: `allowanceKeyOf` keys it. */
export const SESSION_ANSWERS = ["declined", "leftForView"] as const;

export type SessionAnswer = (typeof SESSION_ANSWERS)[number];

/** No notice asks again about an allowance the user declined or left to a view. */
export function notAskedAgain(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set(answers.keys());
}

/** An allowance left to a view keeps its state, so only a decline changes what the gate reports. */
export function declinedKeys(answers: ReadonlyMap<string, SessionAnswer>): ReadonlySet<string> {
    return new Set([...answers].filter(([, answer]) => answer === "declined").map(([key]) => key));
}
