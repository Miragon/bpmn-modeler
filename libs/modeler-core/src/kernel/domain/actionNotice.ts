/** The IntelliJ host reads this tuple to pin its own copy of the tones. */
export const ACTION_NOTICE_TONES = ["info", "warning"] as const;

export type ActionNoticeTone = (typeof ACTION_NOTICE_TONES)[number];

export interface NoticeAction<V> {
    readonly label: string;
    readonly value: V;
}

/**
 * A notification that offers the user one or more actions, built in full by
 * the core. The host renders it as its own non-modal notification.
 */
export interface ActionNotice<V> {
    /** Names the notice independently of its text, so the test kit can answer it. */
    readonly id: string;
    readonly tone: ActionNoticeTone;
    readonly message: string;
    readonly actions: readonly NoticeAction<V>[];
}
