/** A command a router drops on purpose names why, so its log line and a coverage check can say it. */
export function requireIgnoreReason(type: string, reason: string): void {
    if (reason.trim() === "") {
        throw new Error(`${type} needs a reason to be ignored`);
    }
}
