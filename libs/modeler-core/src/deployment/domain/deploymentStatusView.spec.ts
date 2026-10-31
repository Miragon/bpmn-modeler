import { describe, expect, it } from "vitest";

import { StatusView } from "../../kernel/domain/statusView";
import {
    DeploymentStatus,
    deploymentStatusView,
    StatusConnection,
    timestampFormatter,
} from "./deploymentStatusView";

const DEPLOYED_AT = "2026-09-17T14:40:00.000Z";
const VERIFIED_AT = "2026-09-17T15:00:00.000Z";
// Marks where a time goes, so the table pins the texts and the format rows pin the format.
const markTimestamp = (iso: string) => `<${iso}>`;

const DEV: StatusConnection = { kind: "named", name: "dev" };
const FORM_VALUES: StatusConnection = { kind: "formValues" };
const NO_CONNECTION: StatusConnection = { kind: "none" };

const dotView = (text: string, tooltip: string, tone: StatusView["tone"]): StatusView => ({
    text,
    icon: "dot",
    tooltip,
    tone,
    action: "deploymentMenu",
});

interface ViewCase {
    readonly name: string;
    readonly status: DeploymentStatus;
    readonly view: StatusView;
}

const namedTargetCases: ViewCase[] = [
    {
        name: "shows a named target deployed with the current diagram in green",
        status: { connection: DEV, freshness: "deployed", deployedAt: DEPLOYED_AT },
        view: dotView("dev", `Deployed — last deployed <${DEPLOYED_AT}>`, "success"),
    },
    {
        name: "says a named target matches the last deployment when no time was recorded",
        status: { connection: DEV, freshness: "deployed" },
        view: dotView("dev", "Deployed — matches the last deployment", "success"),
    },
    {
        name: "adds the verification time to a named target's deployed tooltip",
        status: {
            connection: DEV,
            freshness: "deployed",
            deployedAt: DEPLOYED_AT,
            verifiedAt: VERIFIED_AT,
        },
        view: dotView(
            "dev",
            `Deployed — last deployed <${DEPLOYED_AT}> — verified <${VERIFIED_AT}>`,
            "success",
        ),
    },
    {
        name: "shows undeployed changes to a named target in yellow",
        status: { connection: DEV, freshness: "changed", deployedAt: DEPLOYED_AT },
        view: dotView("dev", `Undeployed changes — last deployed <${DEPLOYED_AT}>`, "attention"),
    },
    {
        name: "shows undeployed changes to a named target without a recorded time",
        status: { connection: DEV, freshness: "changed", verifiedAt: VERIFIED_AT },
        view: dotView(
            "dev",
            `Undeployed changes since the last deployment — verified <${VERIFIED_AT}>`,
            "attention",
        ),
    },
    {
        name: "shows a different engine version on a named target in blue",
        status: {
            connection: DEV,
            freshness: "superseded",
            deployedAt: DEPLOYED_AT,
            verifiedAt: VERIFIED_AT,
        },
        view: dotView(
            "dev",
            `Deployed version differs from your diagram (deployed <${DEPLOYED_AT}>) — verified <${VERIFIED_AT}>`,
            "info",
        ),
    },
    {
        name: "shows a different engine version on a named target without a recorded time",
        status: { connection: DEV, freshness: "superseded" },
        view: dotView("dev", "Deployed version differs from your diagram", "info"),
    },
    {
        name: "shows a named target this machine never deployed to in gray",
        status: { connection: DEV, freshness: "unknown" },
        view: dotView(
            "dev",
            "Never deployed to this target from this machine — click to switch target",
            "neutral",
        ),
    },
];

const formValuesCases: ViewCase[] = [
    {
        name: "labels the form values and says the diagram was deployed with them",
        status: { connection: FORM_VALUES, freshness: "deployed", deployedAt: DEPLOYED_AT },
        view: dotView(
            "Form values",
            `Deployed with the form values — last deployed <${DEPLOYED_AT}>`,
            "success",
        ),
    },
    {
        name: "says the form values match the last deployment when no time was recorded",
        status: { connection: FORM_VALUES, freshness: "deployed", verifiedAt: VERIFIED_AT },
        view: dotView(
            "Form values",
            `Deployed with the form values — matches the last deployment — verified <${VERIFIED_AT}>`,
            "success",
        ),
    },
    {
        name: "shows undeployed changes since the deployment with the form values",
        status: { connection: FORM_VALUES, freshness: "changed", deployedAt: DEPLOYED_AT },
        view: dotView(
            "Form values",
            `Undeployed changes since the deployment with the form values — last deployed <${DEPLOYED_AT}>`,
            "attention",
        ),
    },
    {
        name: "shows undeployed changes since the deployment with the form values without a recorded time",
        status: { connection: FORM_VALUES, freshness: "changed" },
        view: dotView(
            "Form values",
            "Undeployed changes since the last deployment with the form values",
            "attention",
        ),
    },
    {
        name: "shows a different engine version deployed with the form values",
        status: {
            connection: FORM_VALUES,
            freshness: "superseded",
            deployedAt: DEPLOYED_AT,
            verifiedAt: VERIFIED_AT,
        },
        view: dotView(
            "Form values",
            `Version deployed with the form values differs from your diagram (deployed <${DEPLOYED_AT}>) — verified <${VERIFIED_AT}>`,
            "info",
        ),
    },
    {
        name: "shows a different engine version deployed with the form values without a recorded time",
        status: { connection: FORM_VALUES, freshness: "superseded" },
        view: dotView(
            "Form values",
            "Version deployed with the form values differs from your diagram",
            "info",
        ),
    },
    {
        name: "says the form values were never deployed from this machine",
        status: { connection: FORM_VALUES, freshness: "unknown" },
        view: dotView(
            "Form values",
            "Never deployed with the form values from this machine — click to switch target",
            "neutral",
        ),
    },
];

const NO_TARGET_VIEW = dotView(
    "No deployment target",
    "No deployment target selected — click to choose one",
    "neutral",
);

const noConnectionCases: ViewCase[] = [
    {
        name: "asks for a target when no connection is saved",
        status: { connection: NO_CONNECTION, freshness: "unknown" },
        view: NO_TARGET_VIEW,
    },
    {
        name: "shows no freshness without a connection it could refer to",
        status: {
            connection: NO_CONNECTION,
            freshness: "deployed",
            deployedAt: DEPLOYED_AT,
            verifiedAt: VERIFIED_AT,
        },
        view: NO_TARGET_VIEW,
    },
];

describe("deploymentStatusView", () => {
    it.each([...namedTargetCases, ...formValuesCases, ...noConnectionCases])(
        "$name",
        ({ status, view }) => {
            expect(deploymentStatusView(status, markTimestamp)).toEqual(view);
        },
    );
});

describe("timestampFormatter", () => {
    // Midday UTC, so the date stays the 17th from UTC−12 to UTC+11.
    const MIDDAY = "2026-09-17T12:00:00.000Z";

    it.each([
        ["en", "9/17/26"],
        ["de", "17.09.26"],
    ])("formats a time in the modeler language %s", (language, shortDate) => {
        expect(timestampFormatter(language)(MIDDAY)).toContain(shortDate);
    });

    it("formats in the machine's locale when the language is no locale tag", () => {
        const machineLocale = new Intl.DateTimeFormat().resolvedOptions().locale;

        expect(timestampFormatter("en_US")(MIDDAY)).toBe(timestampFormatter(machineLocale)(MIDDAY));
    });

    it("keeps a recorded time it cannot read as it was stored", () => {
        expect(timestampFormatter("en")("last Tuesday")).toBe("last Tuesday");
    });
});
