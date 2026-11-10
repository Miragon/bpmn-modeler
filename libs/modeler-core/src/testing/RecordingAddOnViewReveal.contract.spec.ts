import { describeAddOnViewRevealContract } from "./addOnViewRevealContract";
import { RecordingAddOnViewReveal } from "./RecordingAddOnViewReveal";

describeAddOnViewRevealContract("RecordingAddOnViewReveal", async ({ showsView }) => {
    const view = new RecordingAddOnViewReveal({ shows: showsView });
    return { view, shownRows: () => view.revealed };
});
