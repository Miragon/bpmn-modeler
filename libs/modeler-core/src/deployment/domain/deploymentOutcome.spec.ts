import { describe, expect, it } from "vitest";

import { DeploymentResult } from "./deployment";
import {
    DeploymentOutcome,
    DeploymentOutcomeKind,
    NotRemembered,
    RememberedPart,
} from "./deploymentOutcome";

const ACCEPTED = new DeploymentResult(true, "Deployment 'order' succeeded.", "dep-1");
const REJECTED = new DeploymentResult(false, "Deployment 'order' failed.");

interface OutcomeCase {
    readonly behaviour: string;
    readonly engine: DeploymentResult;
    readonly failedSaves: readonly [RememberedPart, string][];
    readonly kind: DeploymentOutcomeKind;
    readonly succeeded: boolean;
    readonly notRemembered: readonly NotRemembered[];
    readonly result: DeploymentResult;
}

describe("DeploymentOutcome", () => {
    it.each<OutcomeCase>([
        {
            behaviour: "reports an engine-accepted deploy that remembered everything as deployed",
            engine: ACCEPTED,
            failedSaves: [],
            kind: "deployed",
            succeeded: true,
            notRemembered: [],
            result: ACCEPTED,
        },
        {
            behaviour:
                "keeps an engine-accepted deploy deployed when remembering its credentials fails",
            engine: ACCEPTED,
            failedSaves: [["credentials", "no OS keyring"]],
            kind: "deployedNotRemembered",
            succeeded: true,
            notRemembered: [{ part: "credentials", reason: "no OS keyring" }],
            result: new DeploymentResult(
                true,
                "Deployment 'order' succeeded. Not saved: credentials (no OS keyring).",
                "dep-1",
            ),
        },
        {
            behaviour: "names every part it could not remember, in order",
            engine: ACCEPTED,
            failedSaves: [
                ["connection", "state locked"],
                ["credentials", "no OS keyring"],
                ["ledgerRow", "workspace state unavailable"],
            ],
            kind: "deployedNotRemembered",
            succeeded: true,
            notRemembered: [
                { part: "connection", reason: "state locked" },
                { part: "credentials", reason: "no OS keyring" },
                { part: "ledgerRow", reason: "workspace state unavailable" },
            ],
            result: new DeploymentResult(
                true,
                "Deployment 'order' succeeded. Not saved: connection settings (state locked), " +
                    "credentials (no OS keyring), deployment status (workspace state unavailable).",
                "dep-1",
            ),
        },
        {
            behaviour:
                "stays failed with the engine's message when a rejected deploy is asked to remember",
            engine: REJECTED,
            failedSaves: [["ledgerRow", "workspace state unavailable"]],
            kind: "failed",
            succeeded: false,
            notRemembered: [],
            result: REJECTED,
        },
    ])("$behaviour", ({ engine, failedSaves, kind, succeeded, notRemembered, result }) => {
        const outcome = failedSaves.reduce(
            (current, [part, reason]) => current.notRemembering(part, reason),
            DeploymentOutcome.fromEngine(engine),
        );

        expect({
            kind: outcome.kind,
            succeeded: outcome.succeeded,
            deploymentId: outcome.deploymentId,
            notRemembered: outcome.notRemembered,
        }).toEqual({ kind, succeeded, deploymentId: engine.deploymentId, notRemembered });
        expect(outcome.toResult()).toEqual(result);
    });

    it("leaves the outcome it was asked to amend unchanged", () => {
        const deployed = DeploymentOutcome.fromEngine(ACCEPTED);

        deployed.notRemembering("credentials", "no OS keyring");

        expect(deployed.kind).toBe("deployed");
        expect(deployed.notRemembered).toEqual([]);
    });
});
