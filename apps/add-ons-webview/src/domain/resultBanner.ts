import type { AddOnActionResultPayload } from "@miragon/bpmn-modeler-shared";

export interface Banner {
    readonly tone: "status" | "alert";
    readonly text: string;
}

export function resultBannerOf(result: AddOnActionResultPayload): Banner | undefined {
    switch (result.kind) {
        case "done":
            return result.message === undefined
                ? undefined
                : { tone: "status", text: result.message };
        case "refused":
        case "failed":
            return { tone: "alert", text: result.message };
        case "reportedByFlow":
            // The flow reported in the host's own UI.
            return undefined;
    }
}
