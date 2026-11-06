import {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
    MarketplacePromptPort,
} from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import {
    MarketplacePromptShowParams,
    MarketplacePromptShowResult,
} from "../../../protocol/domain/types";

/** `problemWith` cannot cross the bridge; the core checks the answer and asks again. */
export class RpcMarketplacePrompt implements MarketplacePromptPort {
    constructor(private readonly rpc: Rpc) {}

    async promptForMarketplace({
        problemWith: _checkedByTheCore,
        ...question
    }: MarketplaceAddPrompt): Promise<MarketplaceAddAnswer | undefined> {
        const result = (await this.rpc.request(
            METHODS.marketplacePromptShow,
            question satisfies MarketplacePromptShowParams,
        )) as MarketplacePromptShowResult | null;
        return result ?? undefined;
    }
}
