import { beforeEach, describe, expect, it } from "vitest";

import { WorkspaceTrustPort } from "../kernel/port/hostPorts";

/**
 * One {@link WorkspaceTrustPort} adapter under the
 * {@link describeWorkspaceTrustContract} scenarios, opened on a workspace the
 * user has not trusted yet.
 */
export interface WorkspaceTrustContractFixture {
    readonly trust: WorkspaceTrustPort;
    /** The user trusts the workspace in the host. */
    grant(): Promise<void>;
    /** The user withdraws it; absent where the host restarts instead, as VS Code reloads the window. */
    readonly withdraw?: () => Promise<void>;
}

/**
 * The rules of {@link WorkspaceTrustPort} the core relies on: the plugins,
 * the rule packages and the add-on catalog read the trust synchronously when
 * a listener fires, so a listener reads the new value, and an unchanged
 * value reloads no editor.
 */
export function describeWorkspaceTrustContract(
    adapter: string,
    createFixture: () => Promise<WorkspaceTrustContractFixture>,
): void {
    describe(`${adapter} keeps the WorkspaceTrustPort contract`, () => {
        let fixture: WorkspaceTrustContractFixture;

        beforeEach(async () => {
            fixture = await createFixture();
        });

        it("reads a workspace the user has not trusted as untrusted", () => {
            expect(fixture.trust.isTrusted()).toBe(false);
        });

        it("tells each listener once that the user trusted it, and the listener reads it trusted", async () => {
            const reads: boolean[] = [];
            fixture.trust.onDidChange(() => reads.push(fixture.trust.isTrusted()));

            await fixture.grant();

            expect(reads).toEqual([true]);
        });

        it("tells nothing when the trust it reports again is unchanged", async () => {
            await fixture.grant();
            let calls = 0;
            fixture.trust.onDidChange(() => calls++);

            await fixture.grant();

            expect(calls).toBe(0);
        });

        it("tells nothing to a listener that stopped listening", async () => {
            let calls = 0;
            fixture.trust.onDidChange(() => calls++).dispose();

            await fixture.grant();

            expect(calls).toBe(0);
        });

        it("tells a withdrawal where the host reports one, and reads it untrusted again", async () => {
            const { withdraw } = fixture;
            if (withdraw === undefined) return;
            await fixture.grant();
            const reads: boolean[] = [];
            fixture.trust.onDidChange(() => reads.push(fixture.trust.isTrusted()));

            await withdraw();

            expect(reads).toEqual([false]);
        });
    });
}
