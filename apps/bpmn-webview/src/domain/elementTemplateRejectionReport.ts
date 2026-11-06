export interface ElementTemplateRejectionReport {
    readonly logLines: readonly string[];
    /** One notice for the whole batch; `undefined` when nothing was rejected. */
    readonly notice: string | undefined;
}

export function elementTemplateRejectionReport(
    errors: readonly unknown[] | undefined,
): ElementTemplateRejectionReport {
    const messages = (errors ?? []).map((error) =>
        error instanceof Error ? error.message : String(error),
    );
    return {
        logLines: messages.map((message) => `Element template rejected: ${message}`),
        notice: rejectionNotice(messages.length),
    };
}

function rejectionNotice(rejectedCount: number): string | undefined {
    if (rejectedCount === 0) {
        return undefined;
    }
    return rejectedCount === 1
        ? "An element template was rejected and is ignored. See the log for details."
        : `${rejectedCount} element templates were rejected and are ignored. See the log for details.`;
}
