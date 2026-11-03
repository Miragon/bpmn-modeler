import { TokenPrompt, TokenPromptPort } from "@miragon/bpmn-modeler-core";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { TokenPromptShowParams, TokenPromptShowResult } from "../../../protocol/domain/types";

/** IntelliJ's password dialog always masks, so only the text travels. */
export class RpcTokenPrompt implements TokenPromptPort {
    constructor(private readonly rpc: Rpc) {}

    async promptForToken(prompt: TokenPrompt): Promise<string | undefined> {
        const result = (await this.rpc.request(METHODS.tokenPromptShow, {
            title: prompt.title,
            prompt: prompt.prompt,
        } satisfies TokenPromptShowParams)) as TokenPromptShowResult | null;
        return result?.token ?? undefined;
    }
}
