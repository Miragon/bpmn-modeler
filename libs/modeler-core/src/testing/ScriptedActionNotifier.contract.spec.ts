import { describeActionNotifierContract } from "./actionNotifierContract";
import { NoticeAnswers, ScriptedActionNotifier } from "./ScriptedActionNotifier";

describeActionNotifierContract("ScriptedActionNotifier", async () => {
    const answers: NoticeAnswers = {};
    const notifier = new ScriptedActionNotifier(answers);
    return {
        notifier,
        userClicks: (notice, index) => {
            answers[notice.id] = notice.actions[index].value;
        },
        userCloses: (notice) => {
            delete answers[notice.id];
        },
        lastShown: () => {
            const notice = notifier.notices.at(-1);
            return (
                notice && {
                    tone: notice.tone,
                    message: notice.message,
                    labels: notice.actions.map((action) => action.label),
                }
            );
        },
    };
});
