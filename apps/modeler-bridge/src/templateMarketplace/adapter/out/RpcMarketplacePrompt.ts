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

/** IntelliJ asks in one form and the core checks the answer, so the check stays here. */
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
