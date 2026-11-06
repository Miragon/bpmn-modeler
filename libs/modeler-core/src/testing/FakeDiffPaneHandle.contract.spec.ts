import { describeDiffPaneContract } from "./diffPaneContract";
import { FakeDiffPaneHandle } from "./FakeDiffPaneHandle";

describeDiffPaneContract("FakeDiffPaneHandle", (sides) => {
    const before = new FakeDiffPaneHandle(sides.before.uri, sides.before.text);
    const after = new FakeDiffPaneHandle(sides.after.uri, sides.after.text);
    return {
        before,
        after,
        receivedBy: (side) => (side === "before" ? before : after).posted,
    };
});
