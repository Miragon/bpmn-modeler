import { describe, expect, it, vi } from "vitest";

import {
    ConflictStages,
    ConflictVersionsSource,
    GitRefFacts,
} from "../diff/port/ConflictVersionsSource";

/** One conflicted file as Git holds it. */
export interface StagedConflict {
    readonly fileUri: string;
    readonly stages: ConflictStages;
    readonly refs?: GitRefFacts;
    readonly workingText?: string;
}

/** One {@link ConflictVersionsSource} adapter over a Git the scenario controls. */
export interface ConflictVersionsContractFixture {
    readonly source: ConflictVersionsSource;
    /** Git conflicts the file in the repository at `root`; Git's own state learns it on the next status refresh. */
    conflict(root: string, conflict: StagedConflict): void;
    /** The file leaves Merge Changes, as after `git add`; Git learns it on the next status refresh. */
    resolve(root: string, fileUri: string): void;
    /** Git refreshes its status on its own and tells its listeners. */
    gitNotices(): Promise<void>;
    /** The repository at `root` opens only after the core asked for one of its files. */
    openLater(root: string): void;
    /** The Git integration is missing or disabled. */
    gitMissing(): void;
    /** The Git integration never finishes starting. */
    gitStaysUninitialized(): void;
    /** How many listeners the adapter holds on the Git integration. */
    gitListenerCount(): number;
}

const ROOT = "file:///work/repo";
const ORDER = `${ROOT}/order.bpmn`;
const OTHER_ROOT = "file:///work/other";
const HEAD = { hash: "1111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", subject: "Check the order" };
const OTHER = { hash: "9f8e7d6bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", subject: "Rename the check" };
const STALE = { hash: "5a5a5a5ccccccccccccccccccccccccccccccccc", subject: "An earlier rebase" };

const conflictOf = (fileUri: string, overrides: Partial<StagedConflict> = {}): StagedConflict => ({
    fileUri,
    stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
    refs: { headName: "main", head: HEAD, mergeHead: OTHER },
    workingText: "<<<<<<< HEAD\n=======\n>>>>>>> feature\n",
    ...overrides,
});

const lastHeard = (heard: (readonly string[])[]) => heard[heard.length - 1];

/**
 * What the core relies on of a host's Git integration: a missing stage is
 * absent, not empty; texts stay as Git holds them; a read sees Git's state
 * of now, also in a repository that opens late; Git that is missing or never
 * starts reads as unavailable within a bounded time and leaves no listener;
 * and a watcher hears every repository's Merge Changes until it is disposed.
 */
export function describeConflictVersionsContract(
    adapter: string,
    createFixture: () => ConflictVersionsContractFixture,
): void {
    describe(`${adapter} keeps the ConflictVersionsSource contract`, () => {
        it("hands over every stage and the refs of a conflict", async () => {
            const fixture = createFixture();
            fixture.conflict(ROOT, conflictOf(ORDER));

            expect(await fixture.source.readConflict(ORDER)).toStrictEqual({
                gitAvailable: true,
                inMergeChanges: true,
                stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
                refs: { headName: "main", head: HEAD, mergeHead: OTHER },
                workingText: "<<<<<<< HEAD\n=======\n>>>>>>> feature\n",
            });
        });

        it("leaves a stage Git does not hold absent and an empty one empty", async () => {
            const fixture = createFixture();
            fixture.conflict(
                ROOT,
                conflictOf(ORDER, { stages: { current: "<current/>", incoming: "" } }),
            );

            const { stages } = await fixture.source.readConflict(ORDER);

            expect(stages).toStrictEqual({ current: "<current/>", incoming: "" });
        });

        it("keeps a stage's text as Git holds it", async () => {
            const fixture = createFixture();
            const text = '<bpmn:task name="Prüfung ✓ – 注文" />\r\n';
            fixture.conflict(
                ROOT,
                conflictOf(ORDER, { stages: { current: text, incoming: text } }),
            );

            const { stages } = await fixture.source.readConflict(ORDER);

            expect(stages).toStrictEqual({ current: text, incoming: text });
        });

        it("reads a file outside every repository as not conflicted", async () => {
            const fixture = createFixture();
            fixture.conflict(ROOT, conflictOf(ORDER));

            const facts = await fixture.source.readConflict("file:///elsewhere/order.bpmn");

            expect(facts).toStrictEqual({
                gitAvailable: true,
                inMergeChanges: false,
                stages: {},
                refs: {},
            });
        });

        it("reads a conflict Git has not refreshed its status for yet", async () => {
            const fixture = createFixture();
            fixture.conflict(ROOT, conflictOf(`${ROOT}/first.bpmn`));
            await fixture.source.readConflict(`${ROOT}/first.bpmn`);

            fixture.conflict(ROOT, conflictOf(ORDER));

            expect(await fixture.source.readConflict(ORDER)).toMatchObject({
                inMergeChanges: true,
            });
        });

        it("hands over REBASE_HEAD and a running rebase when Git's own rebase state misses it", async () => {
            const fixture = createFixture();
            const refs = { head: HEAD, rebaseHead: OTHER, rebaseInProgress: true };
            fixture.conflict(ROOT, conflictOf(ORDER, { refs }));

            expect((await fixture.source.readConflict(ORDER)).refs).toStrictEqual(refs);
        });

        it("hands over a REBASE_HEAD an earlier rebase left behind, with no rebase running", async () => {
            const fixture = createFixture();
            const refs = { headName: "main", head: HEAD, rebaseHead: STALE, mergeHead: OTHER };
            fixture.conflict(ROOT, conflictOf(ORDER, { refs }));

            expect((await fixture.source.readConflict(ORDER)).refs).toStrictEqual(refs);
        });

        it("finds a repository that opens after the request", async () => {
            const fixture = createFixture();
            fixture.openLater(ROOT);
            fixture.conflict(ROOT, conflictOf(ORDER));

            expect(await fixture.source.readConflict(ORDER)).toMatchObject({
                inMergeChanges: true,
            });
        });

        it("reads Git as unavailable when it is missing", async () => {
            const fixture = createFixture();
            fixture.gitMissing();

            expect(await fixture.source.readConflict(ORDER)).toStrictEqual({
                gitAvailable: false,
                inMergeChanges: false,
                stages: {},
                refs: {},
            });
        });

        it("reads Git as unavailable when it does not start in time, leaving no listener", async () => {
            const fixture = createFixture();
            fixture.gitStaysUninitialized();

            expect(await fixture.source.readConflict(ORDER)).toMatchObject({ gitAvailable: false });
            expect(fixture.gitListenerCount()).toBe(0);
        });

        it("tells a watcher every conflicted file of every repository", async () => {
            const fixture = createFixture();
            const heard: (readonly string[])[] = [];
            fixture.source.watchMergeChanges((uris) => heard.push([...uris].sort()));

            fixture.conflict(ROOT, conflictOf(ORDER));
            fixture.conflict(OTHER_ROOT, conflictOf(`${OTHER_ROOT}/invoice.bpmn`));
            await fixture.gitNotices();

            await vi.waitFor(() =>
                expect(lastHeard(heard)).toStrictEqual([`${OTHER_ROOT}/invoice.bpmn`, ORDER]),
            );
        });

        it("tells a watcher once the last conflict left Merge Changes", async () => {
            const fixture = createFixture();
            const heard: (readonly string[])[] = [];
            fixture.conflict(ROOT, conflictOf(ORDER));
            await fixture.gitNotices();
            fixture.source.watchMergeChanges((uris) => heard.push(uris));
            await vi.waitFor(() => expect(lastHeard(heard)).toStrictEqual([ORDER]));

            fixture.resolve(ROOT, ORDER);
            await fixture.gitNotices();

            await vi.waitFor(() => expect(lastHeard(heard)).toStrictEqual([]));
        });

        it("tells a disposed watcher nothing and lets go of Git", async () => {
            const fixture = createFixture();
            const heard: (readonly string[])[] = [];
            fixture.conflict(ROOT, conflictOf(ORDER));
            await fixture.gitNotices();
            const watch = fixture.source.watchMergeChanges((uris) => heard.push(uris));
            await vi.waitFor(() => expect(heard).toHaveLength(1));

            watch.dispose();
            fixture.resolve(ROOT, ORDER);
            await fixture.gitNotices();

            expect(heard).toHaveLength(1);
            expect(fixture.gitListenerCount()).toBe(0);
        });
    });
}
