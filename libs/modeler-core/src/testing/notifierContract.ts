import { beforeEach, describe, expect, it } from "vitest";

import { EngineDeploymentSnapshot } from "../deployment/domain/deploymentVerification";
import { EngineInspectionFailedError } from "../deployment/domain/errors";
import { UserCancelledError } from "../kernel/domain/errors";
import { NotifierPort } from "../kernel/port/hostPorts";
import { MarketplaceUpdateOutcome } from "../template-marketplace/domain/marketplace";

/** One {@link NotifierPort} adapter under the {@link describeNotifierContract} scenarios. */
export interface NotifierContractFixture {
    readonly notifier: NotifierPort;
    /** The titles of the progress indicators the host shows now. */
    showingProgress(): readonly string[];
}

const UPDATE_OUTCOME: MarketplaceUpdateOutcome = {
    succeeded: 1,
    failures: [{ label: "acme-templates", reason: "getaddrinfo ENOTFOUND github.com" }],
};

const DEPLOYED_SNAPSHOT: EngineDeploymentSnapshot = {
    processDefinitionId: "order:3:5d1c",
    deploymentId: "dep-3",
    resourceName: "order.bpmn",
    xml: "<bpmn:definitions/>",
    deploymentTime: "2026-10-01T10:00:00.000Z",
};

/** Each case is a value a core call site reads back from its task. */
const VALUES: readonly { readonly behaviour: string; readonly value: unknown }[] = [
    { behaviour: "the update outcome the marketplace summary counts", value: UPDATE_OUTCOME },
    { behaviour: "the engine snapshot a verification reconciles", value: DEPLOYED_SNAPSHOT },
    // A deploy resolves nothing, and a lookup of a process the engine lacks resolves undefined.
    { behaviour: "undefined", value: undefined },
];

/** Each case is an error a core call site tells apart by its class or its fields. */
const FAILURES: readonly { readonly behaviour: string; readonly error: Error }[] = [
    {
        behaviour: "an auth failure the verification words as a credentials problem",
        error: new EngineInspectionFailedError(401, "Unauthorized"),
    },
    {
        behaviour: "a cancelled prompt the verification hands on to its caller",
        error: new UserCancelledError(),
    },
    {
        behaviour: "a plain error the marketplace removal notifies",
        error: new Error("EACCES: permission denied, rmdir '/home/u/.miragon/cache'"),
    },
];

/** Two runs in flight together, in start order; the one at `endsFirst` settles first. */
const OVERLAPS: readonly {
    readonly behaviour: string;
    readonly titles: readonly [string, string];
    readonly endsFirst: 0 | 1;
}[] = [
    {
        behaviour: "keeps showing a run's title when a run of another title ends",
        titles: ['Deploying order.bpmn to "dev"', 'Verifying on "dev"…'],
        endsFirst: 0,
    },
    {
        // A second update queues behind the first under the same title.
        behaviour: "keeps showing a title while a later run of it is still going",
        titles: ["Updating marketplaces…", "Updating marketplaces…"],
        endsFirst: 0,
    },
    {
        // Two verifications on one target share a title and may end in either order.
        behaviour: "keeps showing a title while an earlier run of it is still going",
        titles: ['Verifying on "dev"…', 'Verifying on "dev"…'],
        endsFirst: 1,
    },
];

interface PendingTask<T> {
    readonly task: () => Promise<T>;
    /** Resolves once the adapter has started the task. */
    readonly started: Promise<void>;
    readonly runs: () => number;
    resolve(value: T): void;
    reject(error: Error): void;
}

function pendingTask<T>(): PendingTask<T> {
    let runs = 0;
    let markStarted!: () => void;
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const started = new Promise<void>((settle) => (markStarted = settle));
    const outcome = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return {
        task: () => {
            runs += 1;
            markStarted();
            return outcome;
        },
        started,
        runs: () => runs,
        resolve: (value) => resolve(value),
        reject: (error) => reject(error),
    };
}

/**
 * The rules of {@link NotifierPort.withProgress} the core relies on, run
 * against one adapter. The deploy, verification and marketplace services read
 * back what the task settles with: `withProgress` runs the task once, resolves
 * with its value and rejects with its error, the very instance, so a caller
 * can still tell an auth failure or a cancelled prompt by its class and fields.
 * The progress shows from the task's start until it settles, and ends either
 * way, also while another run is still going. Runs overlap: the marketplace
 * queues an update behind another under the same title, and two verifications
 * on one target share theirs, so a title shows while any run of it is going.
 *
 * Left out:
 * - The notifier's other members: they only render (toasts, log lines, the
 *   console, opening a file), and the core reads nothing back from them.
 * - Whether two runs of one title show one indicator or two: IntelliJ keeps
 *   one spinner per title, VS Code one per run, and the core does not decide.
 * - A task that throws before it returns a promise: every core call site
 *   awaits `withProgress` inside an async function, where a throw and a
 *   rejection land in the same `catch`.
 * - Cancelling: the port has no cancellation, and both hosts show a progress
 *   the user cannot cancel.
 * - What IntelliJ renders, and its cleanup when the bridge dies: the bridge
 *   runs against a loopback peer that answers as the Kotlin host does.
 */
export function describeNotifierContract(
    adapter: string,
    createFixture: () => Promise<NotifierContractFixture>,
): void {
    describe(`${adapter} keeps the NotifierPort contract`, () => {
        let fixture: NotifierContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        const showingTitles = () => [...new Set(fixture.showingProgress())].sort();

        it.each(VALUES)("resolves with the task's value: $behaviour", async ({ value }) => {
            const pending = pendingTask<unknown>();

            const run = fixture.notifier.withProgress("Updating marketplaces…", pending.task);
            pending.resolve(value);

            await expect(run).resolves.toBe(value);
            expect(pending.runs()).toBe(1);
        });

        it.each(FAILURES)("rejects with the task's own error: $behaviour", async ({ error }) => {
            const pending = pendingTask<unknown>();

            const run = fixture.notifier.withProgress('Verifying on "dev"…', pending.task);
            pending.reject(error);

            await expect(run).rejects.toBe(error);
            expect(pending.runs()).toBe(1);
        });

        it.each([
            {
                settles: "resolves",
                settle: (pending: PendingTask<unknown>) => pending.resolve("ok"),
            },
            {
                settles: "rejects",
                settle: (pending: PendingTask<unknown>) => pending.reject(new Error("offline")),
            },
        ])(
            "shows the title while the task runs and ends it once the task $settles",
            async ({ settle }) => {
                const title = 'Deploying order.bpmn to "dev"';
                const pending = pendingTask<unknown>();

                const run = fixture.notifier.withProgress(title, pending.task);
                await pending.started;

                expect(showingTitles()).toEqual([title]);

                settle(pending);
                await run.catch(() => undefined);

                expect(showingTitles()).toEqual([]);
            },
        );

        it.each(OVERLAPS)("$behaviour", async ({ titles, endsFirst }) => {
            const tasks = titles.map(() => pendingTask<string>());
            const runs = titles.map((title, index) =>
                fixture.notifier.withProgress(title, tasks[index].task),
            );
            await Promise.all(tasks.map((pending) => pending.started));
            const endsLast = 1 - endsFirst;

            tasks[endsFirst].resolve("done");
            await runs[endsFirst];

            expect(showingTitles()).toEqual([titles[endsLast]]);

            tasks[endsLast].reject(new Error("offline"));
            await runs[endsLast].catch(() => undefined);

            expect(showingTitles()).toEqual([]);
        });
    });
}
