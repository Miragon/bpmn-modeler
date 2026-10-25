import { describe, expect, it, vi } from "vitest";

import { CredentialDestinationNotApprovedError } from "../../shared/domain/errors";
import { createTestHost } from "../../testing";
import { CredentialDestinations } from "../domain/credentialDestinations";
import { DeploymentTarget } from "../domain/deploymentTarget";
import { CredentialApprovalService } from "./CredentialApprovalService";

const SLOT = "/ws/.camunda/deployment-targets.json::prod";
const AD_HOC_SLOT = "ad-hoc";
const DOC_DIR = "/ws/src";
const TRUSTED_ORIGIN = "https://trusted.example.com";
const IDP_ORIGIN = "https://idp.example.com";
const EVIL_ORIGIN = "https://evil.example.com";

const prodTarget = new DeploymentTarget(
    "prod",
    "c7",
    `${TRUSTED_ORIGIN}/engine-rest`,
    "",
    "basic",
    "",
    "",
);

interface Confirmation {
    title: string;
    confirmLabel: string;
    details: string[];
}

async function createService(
    storedApprovals: Record<string, string[]> = {},
    { confirm = true } = {},
) {
    const host = createTestHost({ answers: { confirmDestructive: confirm } });
    for (const [slot, origins] of Object.entries(storedApprovals)) {
        await host.secrets.saveApprovedDestinations(slot, origins);
    }
    const targetSlots = { resolveSlot: vi.fn().mockResolvedValue(SLOT) };
    const approvedOrigins = host.secrets.getApprovedDestinations.bind(host.secrets);
    const getApprovedDestinations = vi.spyOn(host.secrets, "getApprovedDestinations");
    const saveApprovedDestinations = vi.spyOn(host.secrets, "saveApprovedDestinations");

    const service = new CredentialApprovalService(targetSlots, host.secrets, host.picker);

    const confirmations = (): Confirmation[] =>
        host.picker.prompts
            .filter(({ method }) => method === "confirmDestructive")
            .map(({ args }) => args[0] as Confirmation);

    return {
        service,
        targetSlots,
        getApprovedDestinations,
        saveApprovedDestinations,
        confirmations,
        approvedOrigins,
    };
}

describe("CredentialApprovalService.ensureApproved", () => {
    it("does nothing for a request that sends no credentials", async () => {
        const c = await createService();

        await c.service.ensureApproved(prodTarget, DOC_DIR, CredentialDestinations.none());

        expect(c.targetSlots.resolveSlot).not.toHaveBeenCalled();
        expect(c.getApprovedDestinations).not.toHaveBeenCalled();
        expect(c.confirmations()).toEqual([]);
        expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
    });

    it("sends without asking when every destination is already approved for the target's slot", async () => {
        const c = await createService({ [SLOT]: [TRUSTED_ORIGIN, IDP_ORIGIN] });

        await c.service.ensureApproved(
            prodTarget,
            DOC_DIR,
            CredentialDestinations.of(
                `${TRUSTED_ORIGIN}/engine-rest/deployment/create`,
                `${IDP_ORIGIN}/oauth/token`,
            ),
        );

        expect(c.targetSlots.resolveSlot).toHaveBeenCalledWith("prod", DOC_DIR);
        expect(c.getApprovedDestinations).toHaveBeenCalledWith(SLOT);
        expect(c.confirmations()).toEqual([]);
        expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
    });

    it("asks only about the unapproved origin, naming the target and what was approved before", async () => {
        const c = await createService({ [SLOT]: [TRUSTED_ORIGIN] });

        await c.service.ensureApproved(
            prodTarget,
            DOC_DIR,
            CredentialDestinations.of(`${TRUSTED_ORIGIN}/engine-rest`, `${EVIL_ORIGIN}/token`),
        );

        expect(c.confirmations()).toHaveLength(1);
        const [{ title, confirmLabel, details }] = c.confirmations();
        expect(title).toBe(`Send credentials and .env values to ${EVIL_ORIGIN}?`);
        expect(confirmLabel).toBe("Send Credentials");
        expect(details.slice(0, 2)).toEqual([
            'They belong to target "prod".',
            `Approved so far: ${TRUSTED_ORIGIN}.`,
        ]);
        expect(details[2]).toContain(".env");
    });

    it.each([
        [
            "line breaks, control characters and quotes",
            'prod\r\n"Approved so far: https://trusted.example.com" \tok',
            "prod Approved so far: https://trusted.example.com ok",
        ],
        ["more than 60 characters", `prod-${"x".repeat(100)}`, `prod-${"x".repeat(55)}…`],
        ["surrounding whitespace", "  prod\n", "prod"],
    ])(
        "shows a target name with %s sanitized in the details and never in the title",
        async (_case, name, shown) => {
            const c = await createService();
            const target = new DeploymentTarget(
                name,
                "c7",
                `${TRUSTED_ORIGIN}/engine-rest`,
                "",
                "basic",
                "",
                "",
            );

            await c.service.ensureApproved(
                target,
                DOC_DIR,
                CredentialDestinations.of(`${EVIL_ORIGIN}/engine-rest`),
            );

            const [{ title, details }] = c.confirmations();
            expect(title).toBe(`Send credentials and .env values to ${EVIL_ORIGIN}?`);
            expect(details.slice(0, 2)).toEqual([
                `They belong to target "${shown}".`,
                "No host is approved for them yet.",
            ]);
        },
    );

    it("treats a downgrade from https to http on an approved host as a new destination", async () => {
        const c = await createService({ [SLOT]: [TRUSTED_ORIGIN] });

        await c.service.ensureApproved(
            prodTarget,
            DOC_DIR,
            CredentialDestinations.of("http://trusted.example.com/engine-rest"),
        );

        expect(c.confirmations()).toHaveLength(1);
        expect(c.confirmations()[0].title).toContain("http://trusted.example.com");
    });

    it("rejects with CredentialDestinationNotApprovedError and remembers nothing when declined", async () => {
        const c = await createService({ [SLOT]: [TRUSTED_ORIGIN] }, { confirm: false });

        const approving = c.service.ensureApproved(
            prodTarget,
            DOC_DIR,
            CredentialDestinations.of(`${EVIL_ORIGIN}/engine-rest`),
        );

        await expect(approving).rejects.toBeInstanceOf(CredentialDestinationNotApprovedError);
        await expect(approving).rejects.toMatchObject({ targetName: "prod" });
        expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
        expect(await c.approvedOrigins(SLOT)).toEqual([TRUSTED_ORIGIN]);
    });

    it("remembers the sorted union of earlier and newly accepted origins under the slot", async () => {
        const c = await createService({ [SLOT]: [TRUSTED_ORIGIN, IDP_ORIGIN] });

        await c.service.ensureApproved(
            prodTarget,
            DOC_DIR,
            CredentialDestinations.of(
                `${EVIL_ORIGIN}/engine-rest`,
                "http://evil.example.com:8080/start",
            ),
        );

        expect(c.saveApprovedDestinations).toHaveBeenCalledOnce();
        expect(await c.approvedOrigins(SLOT)).toEqual([
            "http://evil.example.com:8080",
            EVIL_ORIGIN,
            IDP_ORIGIN,
            TRUSTED_ORIGIN,
        ]);
    });

    it("still asks but never persists an approval when the target has no slot", async () => {
        const c = await createService();
        c.targetSlots.resolveSlot.mockResolvedValue(undefined);

        await c.service.ensureApproved(
            prodTarget,
            undefined,
            CredentialDestinations.of(`${TRUSTED_ORIGIN}/engine-rest`),
        );

        expect(c.getApprovedDestinations).not.toHaveBeenCalled();
        expect(c.confirmations()).toHaveLength(1);
        expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
    });

    describe("for an ad-hoc request", () => {
        it("reads and remembers approvals under the ad-hoc slot without resolving a target slot", async () => {
            const c = await createService({ [AD_HOC_SLOT]: [TRUSTED_ORIGIN] });

            await c.service.ensureApproved(
                undefined,
                DOC_DIR,
                CredentialDestinations.of(`${EVIL_ORIGIN}/engine-rest`),
            );

            expect(c.targetSlots.resolveSlot).not.toHaveBeenCalled();
            expect(c.getApprovedDestinations).toHaveBeenCalledExactlyOnceWith(AD_HOC_SLOT);
            expect(c.saveApprovedDestinations).toHaveBeenCalledOnce();
            expect(await c.approvedOrigins(AD_HOC_SLOT)).toEqual([EVIL_ORIGIN, TRUSTED_ORIGIN]);
        });

        it("sends without asking when the ad-hoc slot already approves the origin", async () => {
            const c = await createService({ [AD_HOC_SLOT]: [TRUSTED_ORIGIN] });

            await c.service.ensureApproved(
                undefined,
                DOC_DIR,
                CredentialDestinations.of(`${TRUSTED_ORIGIN}/engine-rest`),
            );

            expect(c.confirmations()).toEqual([]);
            expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
        });

        it("says the secrets belong to the ad-hoc connection", async () => {
            const c = await createService();

            await c.service.ensureApproved(
                undefined,
                DOC_DIR,
                CredentialDestinations.of(`${EVIL_ORIGIN}/engine-rest`),
            );

            const [{ title, details }] = c.confirmations();
            expect(title).toBe(`Send credentials and .env values to ${EVIL_ORIGIN}?`);
            expect(details.slice(0, 2)).toEqual([
                "They belong to the ad-hoc connection.",
                "No host is approved for them yet.",
            ]);
        });

        it("rejects naming the ad-hoc connection and remembers nothing when declined", async () => {
            const c = await createService({}, { confirm: false });

            const approving = c.service.ensureApproved(
                undefined,
                DOC_DIR,
                CredentialDestinations.of(`${EVIL_ORIGIN}/engine-rest`),
            );

            await expect(approving).rejects.toBeInstanceOf(CredentialDestinationNotApprovedError);
            await expect(approving).rejects.toMatchObject({ targetName: AD_HOC_SLOT });
            expect(c.saveApprovedDestinations).not.toHaveBeenCalled();
            expect(await c.approvedOrigins(AD_HOC_SLOT)).toEqual([]);
        });
    });
});
