import { describeTokenPromptContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijPromptHost } from "../../../__fixtures__/intellijPromptHost";
import { RpcTokenPrompt } from "./RpcTokenPrompt";

describeTokenPromptContract("RpcTokenPrompt answered as the IntelliJ host answers", async () => {
    const host = intellijPromptHost();
    return {
        tokenPrompt: new RpcTokenPrompt(host.rpc),
        userTypes: (_prompt, text) => host.answerNext({ kind: "type", text }),
        userDismisses: () => host.answerNext({ kind: "dismiss" }),
    };
});
