import { ElementIdsService, LoggerPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../../protocol/domain/rpcHandler";
import {
    ElementIdReviewRevealParams,
    ElementIdReviewSetCheckedParams,
} from "../../../../protocol/domain/types";

/**
 * RPC (Host → Core): elementIdReview/setChecked, elementIdReview/apply,
 * elementIdReview/discard, elementIdReview/reveal — the actions of IntelliJ's
 * review tool window, which the core answers with the next view.
 */
export function elementIdReviewHandlers(
    elementIds: ElementIdsService,
    logger: LoggerPort,
): RpcHandlerTable {
    const run = async (action: () => Promise<void>): Promise<void> => {
        try {
            await action();
        } catch (error) {
            logger.logError(error instanceof Error ? error : new Error(String(error)));
        }
    };
    return {
        [METHODS.elementIdReviewSetChecked]: (params: ElementIdReviewSetCheckedParams) =>
            run(() => elementIds.setChecked(params.ids, params.checked)),
        [METHODS.elementIdReviewApply]: () => run(() => elementIds.apply()),
        [METHODS.elementIdReviewDiscard]: () => run(() => elementIds.discard()),
        [METHODS.elementIdReviewReveal]: (params: ElementIdReviewRevealParams) =>
            run(() => elementIds.reveal(params.elementId)),
    };
}
