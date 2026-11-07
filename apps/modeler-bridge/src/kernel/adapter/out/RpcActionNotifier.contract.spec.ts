import { describeActionNotifierContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijPromptHost } from "../../../__fixtures__/intellijPromptHost";
import { RpcActionNotifier } from "./RpcActionNotifier";

describeActionNotifierContract("RpcActionNotifier answered as the IntelliJ host answers", async () => {
    const host = intellijPromptHost();
    return {
        notifier: new RpcActionNotifier(host.rpc),
        userClicks: (_notice, index) => host.answerNext({ kind: "click", index }),
        userCloses: () => host.answerNext({ kind: "close" }),
        lastShown: () => host.shownNotice(),
    };
});
