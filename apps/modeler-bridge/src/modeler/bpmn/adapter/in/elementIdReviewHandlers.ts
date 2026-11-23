import { ElementIdReviewService, LoggerPort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../../protocol/domain/descriptor";
import {
    ElementIdReviewRevealParams,
    ElementIdReviewSetCheckedParams,
} from "../../../../protocol/domain/modelerProtocol";
import { RpcHandlerTable } from "../../../../protocol/domain/rpcHandler";

/**
 * RPC (Host → Core): elementIdReview/setChecked, elementIdReview/apply,
 * elementIdReview/discard, elementIdReview/reveal — the actions of IntelliJ's
 * review tool window, which the core answers with the next view.
 */
export function elementIdReviewHandlers(
    elementIdReview: ElementIdReviewService,
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
            run(() => elementIdReview.setChecked(params.ids, params.checked)),
        [METHODS.elementIdReviewApply]: () => run(() => elementIdReview.apply()),
        [METHODS.elementIdReviewDiscard]: () => run(() => elementIdReview.discard()),
        [METHODS.elementIdReviewReveal]: (params: ElementIdReviewRevealParams) =>
            run(() => elementIdReview.reveal(params.elementId)),
    };
}
