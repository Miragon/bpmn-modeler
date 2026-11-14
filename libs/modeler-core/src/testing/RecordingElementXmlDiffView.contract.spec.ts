import { describeElementXmlDiffViewContract } from "./elementXmlDiffViewContract";
import { RecordingElementXmlDiffView } from "./RecordingElementXmlDiffView";

describeElementXmlDiffViewContract("RecordingElementXmlDiffView", (onClosedByUser) => {
    const view = new RecordingElementXmlDiffView(onClosedByUser);
    return {
        view,
        shown: () => view.allShown().map(({ title, before, after }) => ({ title, before, after })),
        closeByUser: (diff) => view.closeByUser(diff.diffKey),
    };
});
