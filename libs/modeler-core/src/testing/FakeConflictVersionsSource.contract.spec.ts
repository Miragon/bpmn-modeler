import { describeConflictVersionsContract } from "./conflictVersionsContract";
import { FakeConflictVersionsSource } from "./FakeConflictVersionsSource";

describeConflictVersionsContract("FakeConflictVersionsSource", () => {
    const source = new FakeConflictVersionsSource();
    return {
        source,
        conflict: (root, conflict) => source.conflict(root, conflict),
        resolve: (root, fileUri) => source.resolve(root, fileUri),
        gitNotices: () => source.gitNotices(),
        openLater: () => source.openLater(),
        gitMissing: () => source.gitMissing(),
        gitStaysUninitialized: () => source.gitStaysUninitialized(),
        gitListenerCount: () => source.gitListenerCount(),
    };
});
