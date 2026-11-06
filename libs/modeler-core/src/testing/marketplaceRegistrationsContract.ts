import { describe, expect, it } from "vitest";

import { MarketplaceSettingsEntry } from "../kernel/domain/modelerSettings";
import {
    MARKETPLACE_SCOPES,
    MarketplaceScope,
    RegistrationsByScope,
    SettingsPlace,
} from "../template-marketplace/domain/marketplaceRegistrations";
import { MarketplaceRegistrationsPort } from "../template-marketplace/port/marketplacePorts";

/** One {@link MarketplaceRegistrationsPort} adapter under the {@link describeMarketplaceRegistrationsContract} scenarios. */
export interface MarketplaceRegistrationsContractFixture {
    /** The adapter of a host with a project open, so both scopes are writable. */
    readonly registrations: MarketplaceRegistrationsPort;
    /** What the host's `SettingsPort.getMarketplaces` reads now, the list the core's prune keeps. */
    settingsRead(): readonly MarketplaceSettingsEntry[];
    /** The host's stores refuse every later write with `reason` and keep what they hold. */
    refuseWrites(reason: string): void;
    /** The host's stores hold `stored` now, as after another window or the user changed them. */
    storeElsewhere(stored: RegistrationsByScope): void;
}

const ALL_PROJECTS_URL = "https://github.com/acme/shared-templates";
const PROJECT_PATH = "/work/project-templates";
const OTHER_PROJECT_PATH = "/work/legacy-templates";
const ADDED_URL = "https://gitlab.com/acme/new-templates";
const OTHER_ALL_PROJECTS_URL = "https://github.com/acme/old-templates";
const SELF_HOSTED: MarketplaceSettingsEntry = {
    provider: "github",
    repo: "acme/templates",
    baseUrl: "https://github.acme.com",
};

const ONE_EACH: RegistrationsByScope = { project: [PROJECT_PATH], allProjects: [ALL_PROJECTS_URL] };
const NOTHING_STORED: RegistrationsByScope = { project: [], allProjects: [] };

type Write = (registrations: MarketplaceRegistrationsPort) => Promise<void>;

const register =
    (location: string, scope: MarketplaceScope): Write =>
    (registrations) =>
        registrations.register(location, scope);
const unregister =
    (...entries: MarketplaceSettingsEntry[]): Write =>
    (registrations) =>
        registrations.unregister(entries);

/** The core joins the segments itself, so each is one name, and a file's holds no separator. */
function isWordable({ kind, path }: SettingsPlace): boolean {
    return (
        path.length > 0 &&
        path.every(
            (segment) => segment.trim() !== "" && (kind !== "file" || !/[/\\]/.test(segment)),
        )
    );
}

/**
 * The rules of {@link MarketplaceRegistrationsPort} the core relies on, run
 * against one adapter: `MarketplaceCommands` decides with `isAlreadyRegistered`
 * on a fresh `read`, so each scope's list must come back as stored, and `read`
 * must return what the stores hold now, including changes made outside the
 * adapter (another window, the user editing the place the core names). A
 * `register` must append to its own scope's list, for all projects even when
 * this project's list holds the location, an `unregister` must remove exactly
 * the given entries from every list, the prune that follows a write must read
 * the new union through `SettingsPort`, and a refused write must reject with
 * the host's reason, which the core shows, and leave a refused location out of
 * that read, as the failed add prunes by it.
 *
 * Left out, as the core does not rely on them:
 * - A registration for this project of a location all projects hold: the core
 *   never asks for one, as `isAlreadyRegistered` checks both lists for this project.
 * - Which places a host names and which scopes it can write without a project:
 *   host facts, pinned in each host's own spec. The suite asks only that both
 *   scopes are writable with a project open and that the core can word each place.
 * - Self-hosted entries on a host that reports nowhere to write one: IntelliJ's
 *   stores hold URL strings only, so that scenario is skipped there.
 * - Two writes at once: the core runs one marketplace flow at a time.
 * - A write that one store accepts and the other refuses: the hosts write their
 *   stores one after another without a rollback, so the suite refuses every write.
 * - What the settings read holds before a write: only the moment a write
 *   resolves is this port's rule; the rest is `SettingsPort`'s.
 * - The order of the settings read: the prune keeps a set of ids and the
 *   update fetches every entry, so only which entries it holds, each once, matters.
 */
export function describeMarketplaceRegistrationsContract(
    adapter: string,
    createFixture: (
        stored: RegistrationsByScope,
    ) => Promise<MarketplaceRegistrationsContractFixture>,
): void {
    describe(`${adapter} keeps the MarketplaceRegistrationsPort contract`, () => {
        const registeredIn = async (registrations: MarketplaceRegistrationsPort) =>
            (await registrations.read()).registered;

        it("reads each scope's own list as stored, an entry both lists hold in both", async () => {
            const stored = {
                project: [PROJECT_PATH, ADDED_URL],
                allProjects: [ADDED_URL, ALL_PROJECTS_URL],
            };
            const { registrations } = await createFixture(stored);

            await expect(registeredIn(registrations)).resolves.toEqual(stored);
        });

        it("reports both scopes writable with a project open, each saved in a place the core can word", async () => {
            const { registrations } = await createFixture(NOTHING_STORED);

            const { writable, selfHostedIn } = await registrations.read();

            expect(writable.map(({ scope }) => scope).sort()).toEqual(
                [...MARKETPLACE_SCOPES].sort(),
            );
            const places = [
                ...writable.map(({ savedIn }) => savedIn),
                ...(selfHostedIn ? [selfHostedIn] : []),
            ];
            expect(places.filter((place) => !isWordable(place))).toEqual([]);
        });

        it.each([
            {
                behaviour: "appends a location to the end of this project's own list",
                stored: ONE_EACH,
                write: register(ADDED_URL, "project"),
                registered: { project: [PROJECT_PATH, ADDED_URL], allProjects: [ALL_PROJECTS_URL] },
            },
            {
                behaviour: "appends a location to the end of all projects' own list",
                stored: ONE_EACH,
                write: register(ADDED_URL, "allProjects"),
                registered: { project: [PROJECT_PATH], allProjects: [ALL_PROJECTS_URL, ADDED_URL] },
            },
            {
                behaviour: "leaves this project's list as it is when it holds the location",
                stored: { project: [ADDED_URL, PROJECT_PATH], allProjects: [ALL_PROJECTS_URL] },
                write: register(ADDED_URL, "project"),
                registered: { project: [ADDED_URL, PROJECT_PATH], allProjects: [ALL_PROJECTS_URL] },
            },
            {
                behaviour: "leaves all projects' list as it is when it holds the location",
                stored: { project: [PROJECT_PATH], allProjects: [ADDED_URL, ALL_PROJECTS_URL] },
                write: register(ADDED_URL, "allProjects"),
                registered: { project: [PROJECT_PATH], allProjects: [ADDED_URL, ALL_PROJECTS_URL] },
            },
            {
                behaviour: "shares an entry of this project with all projects",
                stored: { project: [ADDED_URL], allProjects: [ALL_PROJECTS_URL] },
                write: register(ADDED_URL, "allProjects"),
                registered: { project: [ADDED_URL], allProjects: [ALL_PROJECTS_URL, ADDED_URL] },
            },
            {
                behaviour:
                    "removes the given entries from every list and keeps the others in order",
                stored: {
                    project: [PROJECT_PATH, ADDED_URL, OTHER_PROJECT_PATH],
                    allProjects: [ADDED_URL, ALL_PROJECTS_URL, OTHER_ALL_PROJECTS_URL],
                },
                write: unregister(ADDED_URL, OTHER_ALL_PROJECTS_URL),
                registered: {
                    project: [PROJECT_PATH, OTHER_PROJECT_PATH],
                    allProjects: [ALL_PROJECTS_URL],
                },
            },
            {
                behaviour: "empties a list whose last entry is removed",
                stored: { project: [ADDED_URL], allProjects: [ALL_PROJECTS_URL] },
                write: unregister(ADDED_URL),
                registered: { project: [], allProjects: [ALL_PROJECTS_URL] },
            },
            {
                behaviour: "leaves the lists as they are when no list holds a removed entry",
                stored: ONE_EACH,
                write: unregister(ADDED_URL),
                registered: ONE_EACH,
            },
        ])("$behaviour", async ({ stored, write, registered }) => {
            const { registrations } = await createFixture(stored);
            // The core reads before each write, so a read that keeps its first answer fails here.
            await expect(registeredIn(registrations)).resolves.toEqual(stored);

            await write(registrations);

            await expect(registeredIn(registrations)).resolves.toEqual(registered);
        });

        it("reads the lists as changed outside the adapter and appends to the changed list", async () => {
            const fixture = await createFixture(ONE_EACH);
            await expect(registeredIn(fixture.registrations)).resolves.toEqual(ONE_EACH);
            const changed = {
                project: [OTHER_PROJECT_PATH],
                allProjects: [ALL_PROJECTS_URL, OTHER_ALL_PROJECTS_URL],
            };
            fixture.storeElsewhere(changed);

            await expect(registeredIn(fixture.registrations)).resolves.toEqual(changed);
            await fixture.registrations.register(ADDED_URL, "project");

            await expect(registeredIn(fixture.registrations)).resolves.toEqual({
                project: [OTHER_PROJECT_PATH, ADDED_URL],
                allProjects: [ALL_PROJECTS_URL, OTHER_ALL_PROJECTS_URL],
            });
        });

        it("reads a self-hosted entry as stored and removes an equal copy of it, where the host keeps one", async (context) => {
            const { selfHostedIn } = await (
                await createFixture(NOTHING_STORED)
            ).registrations.read();
            if (!selfHostedIn) context.skip();
            const stored = { project: [SELF_HOSTED], allProjects: [ALL_PROJECTS_URL, SELF_HOSTED] };
            const { registrations } = await createFixture(stored);
            const listed = await registeredIn(registrations);
            // The removal picker offers only what `read` returns.
            expect(listed).toEqual(stored);

            await registrations.unregister([structuredClone(listed.project[0])]);

            await expect(registeredIn(registrations)).resolves.toEqual({
                project: [],
                allProjects: [ALL_PROJECTS_URL],
            });
        });

        it.each([
            {
                change: "registering for this project",
                stored: ONE_EACH,
                write: register(ADDED_URL, "project"),
                settingsRead: [ALL_PROJECTS_URL, PROJECT_PATH, ADDED_URL],
            },
            {
                change: "registering for all projects",
                stored: ONE_EACH,
                write: register(ADDED_URL, "allProjects"),
                settingsRead: [ALL_PROJECTS_URL, ADDED_URL, PROJECT_PATH],
            },
            {
                change: "sharing an entry of this project",
                stored: { project: [ADDED_URL], allProjects: [ALL_PROJECTS_URL] },
                write: register(ADDED_URL, "allProjects"),
                settingsRead: [ALL_PROJECTS_URL, ADDED_URL],
            },
            {
                change: "removing",
                stored: {
                    project: [PROJECT_PATH, ADDED_URL],
                    allProjects: [ADDED_URL, ALL_PROJECTS_URL],
                },
                write: unregister(ADDED_URL),
                settingsRead: [ALL_PROJECTS_URL, PROJECT_PATH],
            },
        ])(
            "resolves $change only once the settings read holds the union, each entry once",
            async ({ stored, write, settingsRead }) => {
                const fixture = await createFixture(stored);

                await write(fixture.registrations);

                expect([...fixture.settingsRead()].sort()).toEqual([...settingsRead].sort());
            },
        );

        it.each([
            { change: "a registration", write: register(ADDED_URL, "allProjects") },
            { change: "a removal", write: unregister(ALL_PROJECTS_URL) },
        ])(
            "rejects $change the host refuses with its reason and keeps the lists",
            async ({ write }) => {
                const fixture = await createFixture(ONE_EACH);
                await expect(registeredIn(fixture.registrations)).resolves.toEqual(ONE_EACH);
                fixture.refuseWrites("settings.json holds errors");

                await expect(write(fixture.registrations)).rejects.toThrow(
                    "settings.json holds errors",
                );

                await expect(registeredIn(fixture.registrations)).resolves.toEqual(ONE_EACH);
            },
        );

        it("keeps a refused registration out of the settings read the failed add prunes by", async () => {
            const fixture = await createFixture(ONE_EACH);
            fixture.refuseWrites("settings.json holds errors");

            await expect(fixture.registrations.register(ADDED_URL, "project")).rejects.toThrow();

            expect(fixture.settingsRead()).not.toContainEqual(ADDED_URL);
        });
    });
}
