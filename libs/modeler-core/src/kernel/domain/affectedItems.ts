import { ConfirmRequest } from "./prompts";

export const MAX_LISTED_AFFECTED_ITEMS = 12;

/**
 * Host dialogs clip a long detail block, so the overflow becomes a count: the
 * user must never consent to removing items the dialog did not mention.
 */
export function summarizeAffectedItems(
    items: readonly string[],
    limit = MAX_LISTED_AFFECTED_ITEMS,
): string[] {
    const listed = items.slice(0, limit);
    const remainder = items.length - listed.length;
    return remainder > 0 ? [...listed, `…and ${remainder} more`] : listed;
}

export function confirmation({
    id,
    title,
    confirmLabel,
    affected,
}: {
    id: string;
    title: string;
    confirmLabel: string;
    affected: readonly string[];
}): ConfirmRequest {
    return { id, title, confirmLabel, details: summarizeAffectedItems(affected) };
}
