import { describeNotifierContract } from "./notifierContract";
import { RecordingNotifier } from "./RecordingNotifier";

describeNotifierContract("RecordingNotifier", async () => {
    const notifier = new RecordingNotifier();
    return { notifier, showingProgress: () => notifier.runningProgress };
});
