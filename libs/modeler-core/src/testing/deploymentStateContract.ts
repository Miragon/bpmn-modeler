import { describe, expect, it } from "vitest";

import { DeployedRevision } from "../deployment/domain/deploymentLedger";
import {
    DEFAULT_DEPLOYMENT_STATE,
    DeploymentState,
    DeploymentStatePatch,
} from "../deployment/domain/deploymentState";
import { DeploymentStatePort } from "../deployment/port/deploymentPorts";

/** One {@link DeploymentStatePort} adapter under the {@link describeDeploymentStateContract} scenarios. */
export interface DeploymentStateContractFixture {
    /** The adapter over a host that has stored nothing yet. */
    readonly deploymentState: DeploymentStatePort;
    /** A new adapter over what the host stored, as the next session (a reload, a bridge respawn) opens it. */
    reopen(): DeploymentStatePort;
    /** Makes the host reject every later write with `reason`. */
    rejectWrites(reason: string): void;
}

const ORDER_ON_DEV = "target:dev@localhost:8080::/w/order.bpmn";
const SHIP_ON_DEV = "target:dev@localhost:8080::/w/ship.bpmn";
const ORDER_ON_PROD = "target:prod@engine.example::/w/order.bpmn";
const PAY_AD_HOC = "adhoc:engine.example/tenant-1::/w/pay.bpmn";

const VERIFIED_REVISION: DeployedRevision = {
    fingerprint: "a1b2c3d4e5f60718",
    deployedAt: "2026-09-30T08:00:00.000Z",
    deploymentId: "dep-0",
    origin: "engine",
    verifiedAt: "2026-10-01T09:00:00.000Z",
};
const LOCAL_REVISION: DeployedRevision = {
    fingerprint: "0f1e2d3c4b5a6978",
    deployedAt: "2026-10-01T10:00:00.000Z",
    deploymentId: "dep-1",
    origin: "local",
};
const BARE_REVISION: DeployedRevision = {
    fingerprint: "1122334455667788",
    deployedAt: "2026-10-02T11:00:00.000Z",
};

const STORED: DeploymentState = {
    endpoint: "https://engine.example/engine-rest",
    tenantId: "tenant-1",
    authType: "oauth2",
    tokenEndpoint: "https://idp.example/token",
    audience: "zeebe-api",
    activeTargetName: "dev",
    ledger: {
        [ORDER_ON_DEV]: VERIFIED_REVISION,
        [SHIP_ON_DEV]: LOCAL_REVISION,
        [ORDER_ON_PROD]: LOCAL_REVISION,
    },
};

/**
 * Each case saves `patch` over {@link STORED}: the shapes the core's call sites send,
 * plus the undefined fields the patch type allows.
 */
const PATCHES: readonly {
    readonly write: string;
    readonly behaviour: string;
    readonly patch: DeploymentStatePatch;
    readonly expected: DeploymentState;
}[] = [
    {
        // An ad-hoc deploy without OAuth2 names no token endpoint or audience.
        write: "a connection without OAuth2",
        behaviour: "replaces the fields the patch names and keeps the ones it leaves out",
        patch: { endpoint: "https://other.example/api", tenantId: "tenant-2", authType: "basic" },
        expected: {
            ...STORED,
            endpoint: "https://other.example/api",
            tenantId: "tenant-2",
            authType: "basic",
        },
    },
    {
        write: "a patch with undefined fields",
        behaviour: "keeps a field the patch sets to undefined",
        patch: {
            endpoint: "https://other.example/api",
            tokenEndpoint: undefined,
            audience: undefined,
            ledger: undefined,
        },
        expected: { ...STORED, endpoint: "https://other.example/api" },
    },
    {
        // Deleting the active target saves "" to return to the ad-hoc connection.
        write: "emptied fields",
        behaviour: "clears a field the patch sets to an empty string",
        patch: { activeTargetName: "", tenantId: "" },
        expected: { ...STORED, activeTargetName: "", tenantId: "" },
    },
    {
        write: "a new ledger row",
        behaviour: "adds a ledger row and keeps the others",
        patch: { ledger: { put: { [PAY_AD_HOC]: LOCAL_REVISION } } },
        expected: { ...STORED, ledger: { ...STORED.ledger, [PAY_AD_HOC]: LOCAL_REVISION } },
    },
    {
        // A new deploy's row carries no verifiedAt or origin of the row it replaces.
        write: "a replaced ledger row",
        behaviour: "replaces a ledger row whole, without the fields the new row leaves out",
        patch: { ledger: { put: { [ORDER_ON_DEV]: BARE_REVISION } } },
        expected: { ...STORED, ledger: { ...STORED.ledger, [ORDER_ON_DEV]: BARE_REVISION } },
    },
    {
        // Pruning a deleted target removes all of its rows in one save.
        write: "removed ledger rows",
        behaviour: "removes every listed ledger row and keeps the others",
        patch: { ledger: { remove: [ORDER_ON_DEV, SHIP_ON_DEV] } },
        expected: { ...STORED, ledger: { [ORDER_ON_PROD]: LOCAL_REVISION } },
    },
    {
        // Verification forgets the row of a process the engine lacks, recorded or not.
        write: "the removal of a missing ledger row",
        behaviour: "ignores a removed ledger row that is not there",
        patch: { ledger: { remove: [PAY_AD_HOC] } },
        expected: STORED,
    },
];

function patchStoring({ ledger, ...fields }: DeploymentState): DeploymentStatePatch {
    return { ...fields, ledger: { put: ledger } };
}

/**
 * The rules of {@link DeploymentStatePort} the core relies on, run against one
 * adapter: what `load` returns before any save, that a resolved save shows in
 * `load` and in the next session as the patch merged over what was stored, that
 * two saves in flight together both land, and that a rejected save rejects with
 * the host's reason and leaves the patch stored whole or not at all.
 *
 * Left out:
 * - what `load` shows while a save is pending: the port leaves it open, and the
 *   bridge applies a patch only once the host accepts it;
 * - a ledger patch that both removes and puts one key: no core call sends one,
 *   and `applyDeploymentStatePatch`'s spec pins that the put wins;
 * - how a host reads a value an earlier release or a hand edit stored, of the
 *   wrong type or under an older key: `deploymentStateFrom`'s spec and each host's
 *   own spec pin it, and the in-memory fake cannot hold such a value;
 * - what IntelliJ stores and seeds: the bridge runs against a loopback peer that
 *   answers as the Kotlin host does, and the Kotlin tests pin that host.
 */
export function describeDeploymentStateContract(
    adapter: string,
    createFixture: () => Promise<DeploymentStateContractFixture>,
): void {
    describe(`${adapter} keeps the DeploymentStatePort contract`, () => {
        async function storedFixture(): Promise<DeploymentStateContractFixture> {
            const fixture = await createFixture();
            await fixture.deploymentState.save(patchStoring(STORED));
            return fixture;
        }

        it("loads the defaults before anything is saved", async () => {
            const fixture = await createFixture();

            expect(fixture.deploymentState.load()).toEqual(DEFAULT_DEPLOYMENT_STATE);
            expect(fixture.reopen().load()).toEqual(DEFAULT_DEPLOYMENT_STATE);
        });

        it("shows every field and ledger row of a save, in this session and the next", async () => {
            const fixture = await storedFixture();

            expect(fixture.deploymentState.load()).toEqual(STORED);
            expect(fixture.reopen().load()).toEqual(STORED);
        });

        it.each(PATCHES)("$behaviour", async ({ patch, expected }) => {
            const fixture = await storedFixture();

            await fixture.deploymentState.save(patch);

            expect(fixture.deploymentState.load()).toEqual(expected);
            expect(fixture.reopen().load()).toEqual(expected);
        });

        it("keeps both of two saves made before either resolves", async () => {
            const fixture = await storedFixture();
            const expected: DeploymentState = {
                ...STORED,
                activeTargetName: "prod",
                ledger: { ...STORED.ledger, [PAY_AD_HOC]: BARE_REVISION },
            };

            await Promise.all([
                fixture.deploymentState.save({ ledger: { put: { [PAY_AD_HOC]: BARE_REVISION } } }),
                fixture.deploymentState.save({ activeTargetName: "prod" }),
            ]);

            expect(fixture.deploymentState.load()).toEqual(expected);
            expect(fixture.reopen().load()).toEqual(expected);
        });

        // VS Code's Memento keeps a rejected value in memory; the bridge and the fake
        // keep the old state. The core reports the failure either way.
        it.each(PATCHES)(
            "rejects $write the host refuses with its reason and stores the patch whole or not at all",
            async ({ patch, expected }) => {
                const fixture = await storedFixture();
                fixture.rejectWrites("disk full");

                await expect(fixture.deploymentState.save(patch)).rejects.toThrow("disk full");

                expect([STORED, expected]).toContainEqual(fixture.deploymentState.load());
                expect([STORED, expected]).toContainEqual(fixture.reopen().load());
            },
        );
    });
}
