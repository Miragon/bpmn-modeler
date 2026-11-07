import { describe, expect, it } from "vitest";

import { HttpTransportError } from "../../kernel/domain/http";
import { contentFingerprint, DeployedRevision } from "./deploymentLedger";
import {
    EngineDeploymentSnapshot,
    reconcile,
    VerificationFacts,
    VerificationFailureNotice,
    verificationFailureNotice,
    verificationMessage,
    VerificationOutcome,
} from "./deploymentVerification";
import {
    CredentialDestinationNotApprovedError,
    DisallowedEnvReferenceError,
    EngineInspectionFailedError,
    InvalidCredentialDestinationError,
    InvalidDeploymentConfigError,
    UnreadableDotEnvError,
    UnresolvedEnvVariableError,
} from "./errors";

const XML = '<bpmn:process id="order"/>';

const snapshot = (overrides: Partial<EngineDeploymentSnapshot> = {}): EngineDeploymentSnapshot => ({
    processDefinitionId: "order:3:def-1",
    deploymentId: "dep-9",
    resourceName: "order.bpmn",
    xml: XML,
    deploymentTime: "2026-09-17T14:40:00.000Z",
    ...overrides,
});

const recorded = (overrides: Partial<DeployedRevision> = {}): DeployedRevision => ({
    fingerprint: contentFingerprint(XML),
    deployedAt: "2026-09-17T14:32:00.000Z",
    deploymentId: "dep-9",
    ...overrides,
});

describe("reconcile", () => {
    it("is missing without an engine snapshot", () => {
        expect(reconcile(recorded(), XML, undefined)).toEqual({ outcome: "missing" });
    });

    it("is current when the engine still runs the recorded deployment", () => {
        const result = reconcile(recorded(), "<edited/>", snapshot());

        expect(result.outcome).toBe("current");
        expect(result.revision).toMatchObject(recorded());
        expect(result.revision?.verifiedAt).toEqual(expect.any(String));
    });

    it("adopts an engine revision matching the editor content", () => {
        const result = reconcile(undefined, XML, snapshot());

        expect(result.outcome).toBe("adopted");
        expect(result.revision).toMatchObject({
            fingerprint: contentFingerprint(XML),
            deployedAt: "2026-09-17T14:40:00.000Z",
            deploymentId: "dep-9",
            origin: "engine",
        });
    });

    it("is superseded when the engine deployment differs from the editor", () => {
        const result = reconcile(
            recorded({ deploymentId: "dep-1" }),
            XML,
            snapshot({ xml: "<different/>" }),
        );

        expect(result.outcome).toBe("superseded");
        expect(result.revision).toMatchObject({
            fingerprint: contentFingerprint("<different/>"),
            deploymentId: "dep-9",
            origin: "engine",
        });
    });

    it("falls back to the verification time when the engine reports no deployment time", () => {
        const result = reconcile(undefined, XML, snapshot({ deploymentTime: undefined }));

        expect(result.revision?.deployedAt).toBe(result.revision?.verifiedAt);
    });

    it("tolerates BOM and CRLF differences between engine bytes and editor buffer", () => {
        const engineXml = "﻿" + XML.replace(/\n/g, "\r\n") + "\r\n";
        const result = reconcile(undefined, XML + "\n", snapshot({ xml: engineXml }));

        expect(result.outcome).toBe("adopted");
    });

    it("never treats a missing recorded deploymentId as current", () => {
        const result = reconcile(
            recorded({ deploymentId: undefined }),
            "<edited/>",
            snapshot({ xml: "<different/>" }),
        );

        expect(result.outcome).toBe("superseded");
    });
});

describe("verificationMessage", () => {
    const RECORDED_AT = "2026-09-17T14:32:00.000Z";
    const ENGINE_AT = "2026-09-17T14:40:00.000Z";
    const shortTime = (iso: string) =>
        new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const facts = (overrides: Partial<VerificationFacts> = {}): VerificationFacts => ({
        targetName: "dev",
        processKey: "order",
        ...overrides,
    });

    it.each<[string, VerificationOutcome, VerificationFacts, string]>([
        [
            "current, with the recorded deploy time",
            "current",
            facts({ revision: recorded({ deployedAt: RECORDED_AT }), snapshot: snapshot() }),
            `Verified: dev runs your last deployment (${shortTime(RECORDED_AT)}).`,
        ],
        [
            "current, without a readable deploy time",
            "current",
            facts({ revision: recorded({ deployedAt: "not-a-time" }), snapshot: snapshot() }),
            "Verified: dev runs your last deployment.",
        ],
        [
            "adopted, with the deploy time of the adopted revision",
            "adopted",
            facts({ revision: recorded({ deployedAt: ENGINE_AT }), snapshot: snapshot() }),
            `Verified: dev runs exactly this diagram (deployed ${shortTime(ENGINE_AT)}).`,
        ],
        [
            "adopted, without a readable deploy time",
            "adopted",
            facts({ revision: recorded({ deployedAt: "" }), snapshot: snapshot() }),
            "Verified: dev runs exactly this diagram.",
        ],
        [
            "superseded, with the deploy time the engine reports",
            "superseded",
            facts({
                revision: recorded({ deployedAt: RECORDED_AT }),
                snapshot: snapshot({ deploymentTime: ENGINE_AT }),
            }),
            `The version deployed on dev (deployed ${shortTime(ENGINE_AT)}) differs from your diagram.`,
        ],
        [
            "superseded, without an engine deploy time even when the revision has one",
            "superseded",
            facts({
                revision: recorded({ deployedAt: RECORDED_AT }),
                snapshot: snapshot({ deploymentTime: undefined }),
            }),
            "The version deployed on dev differs from your diagram.",
        ],
        [
            "current, without a revision",
            "current",
            facts({ snapshot: snapshot() }),
            "Verified: dev runs your last deployment.",
        ],
        [
            "adopted, without a revision",
            "adopted",
            facts({ snapshot: snapshot() }),
            "Verified: dev runs exactly this diagram.",
        ],
        [
            "superseded, without a snapshot",
            "superseded",
            facts({ revision: recorded({ deployedAt: RECORDED_AT }) }),
            "The version deployed on dev differs from your diagram.",
        ],
        [
            "missing, naming the process key",
            "missing",
            facts(),
            "Process 'order' is not deployed on dev.",
        ],
    ])("reports %s", (_case, outcome, verificationFacts, message) => {
        expect(verificationMessage(outcome, verificationFacts)).toBe(message);
    });
});

describe("verificationFailureNotice", () => {
    const UNEXPECTED: VerificationFailureNotice = {
        kind: "unexpected",
        title: "Could not verify deployment",
    };
    const explained = (message: string): VerificationFailureNotice => ({
        kind: "explained",
        message,
    });
    const CHECK_CREDENTIALS = explained(
        'Could not verify deployment on "dev" — check the target credentials.',
    );
    const unresolved = new UnresolvedEnvVariableError("MIRAGON_PW", "auth.password", "/ws/.env");
    const disallowed = new DisallowedEnvReferenceError("endpoint", "MIRAGON_");
    const unreadable = new UnreadableDotEnvError("/ws/.env", "symbolic links are not followed");
    const hostless = new InvalidCredentialDestinationError();
    const declined = new CredentialDestinationNotApprovedError("dev");

    it.each<[string, unknown, VerificationFailureNotice]>([
        ["a 401 from the engine", new EngineInspectionFailedError(401), CHECK_CREDENTIALS],
        [
            "a 403 from the engine",
            new EngineInspectionFailedError(403, "Forbidden"),
            CHECK_CREDENTIALS,
        ],
        ["an unset variable", unresolved, explained(unresolved.message)],
        ["a foreign variable", disallowed, explained(disallowed.message)],
        ["an unreadable .env", unreadable, explained(unreadable.message)],
        ["an endpoint without a host", hostless, explained(hostless.message)],
        ["a declined host", declined, explained(declined.message)],
        ["a 500 from the engine", new EngineInspectionFailedError(500), UNEXPECTED],
        ["a blank endpoint", new InvalidDeploymentConfigError(["endpoint"]), UNEXPECTED],
        ["a transport failure", new HttpTransportError("camunda.prod", "ECONNREFUSED"), UNEXPECTED],
        ["any other error", new Error("boom"), UNEXPECTED],
        ["a thrown non-error", "boom", UNEXPECTED],
    ])("reports %s", (_case, error, notice) => {
        expect(verificationFailureNotice(error, "dev")).toEqual(notice);
    });
});
