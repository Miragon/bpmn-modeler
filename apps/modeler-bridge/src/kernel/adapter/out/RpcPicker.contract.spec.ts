import { describePickerContract } from "@miragon/bpmn-modeler-core/testing";

import { intellijPromptHost } from "../../../__fixtures__/intellijPromptHost";
import { RpcPicker } from "./RpcPicker";

describePickerContract("RpcPicker answered as the IntelliJ host answers", async () => {
    const host = intellijPromptHost();
    return {
        picker: new RpcPicker(host.rpc),
        userPicks: (_prompt, row) => host.answerNext({ kind: "pick", row }),
        userChecks: (_prompt, rows) => host.answerNext({ kind: "check", rows }),
        userDismisses: () => host.answerNext({ kind: "dismiss" }),
        userConfirms: () => host.answerNext({ kind: "confirm" }),
        userDeclines: () => host.answerNext({ kind: "decline" }),
        shownLabels: () => host.shownLabels(),
    };
});
