/** What a host makes the user do before code it already ran is unloaded; a typed fact, never host prose. */
export const PROCESS_RESTARTS = ["reloadWindow", "restartIde"] as const;

export type ProcessRestart = (typeof PROCESS_RESTARTS)[number];

export const PROCESS_RESTART_TEXT: Record<ProcessRestart, string> = {
    reloadWindow: "reload the window",
    restartIde: "restart the IDE",
};

/** What an owner says of its code: what it can do once allowed, and what follows an allow or a revoke. */
export interface ApprovableCodeTexts {
    readonly risk: string;
    readonly allowedFollowUp: string;
    /** Also the note of a row whose code its owner says stays loaded after a revoke. */
    readonly revokedFollowUp: (restart: ProcessRestart) => string;
}
