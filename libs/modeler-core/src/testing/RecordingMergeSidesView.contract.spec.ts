import { describeMergeSidesViewContract } from "./mergeSidesViewContract";
import { RecordingMergeSidesView } from "./RecordingMergeSidesView";

describeMergeSidesViewContract("RecordingMergeSidesView", () => {
    const view = new RecordingMergeSidesView();
    return { view, servedText: (uri) => view.textOf(uri) };
});
