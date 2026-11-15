import { describeMergeSidesViewContract } from "./mergeSidesViewContract";
import { RecordingMergeSidesView } from "./RecordingMergeSidesView";

describeMergeSidesViewContract("RecordingMergeSidesView", {
    createView: () => new RecordingMergeSidesView(),
    servedText: (view, uri) => view.textOf(uri),
});
