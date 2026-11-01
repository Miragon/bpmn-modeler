import { StatusTone, StatusView } from "../../kernel/domain/statusView";
import { DeploymentFreshness } from "./deploymentLedger";

/** The connection the deployment status names, which its freshness refers to. */
export type StatusConnection =
    | { readonly kind: "named"; readonly name: string }
    | { readonly kind: "formValues" }
    | { readonly kind: "none" };

export interface DeploymentStatus {
    readonly connection: StatusConnection;
    readonly freshness: DeploymentFreshness;
    /** ISO times of the recorded revision. */
    readonly deployedAt?: string;
    readonly verifiedAt?: string;
}

export type TimestampFormatter = (iso: string) => string;

const TIMESTAMP_STYLE = { dateStyle: "short", timeStyle: "short" } as const;

/** In the modeler language, and in the machine's time zone unless `timeZone` names one. */
export function timestampFormatter(language: string, timeZone?: string): TimestampFormatter {
    const format = dateTimeFormatFor(language, timeZone);
    return (iso) => {
        const time = new Date(iso);
        // `format` throws on an invalid date, which would fail the refresh and hide the item.
        return Number.isNaN(time.getTime()) ? iso : format.format(time);
    };
}

function dateTimeFormatFor(language: string, timeZone?: string): Intl.DateTimeFormat {
    const options = { ...TIMESTAMP_STYLE, timeZone };
    try {
        return new Intl.DateTimeFormat(language, options);
    } catch {
        // A hand-edited language setting need not be a locale tag.
        return new Intl.DateTimeFormat(undefined, options);
    }
}

const FRESHNESS_TONES: Record<DeploymentFreshness, StatusTone> = {
    deployed: "success",
    changed: "attention",
    superseded: "info",
    unknown: "neutral",
};

interface RecordedRevisionTooltip {
    readonly dated: (deployedWhen: string) => string;
    readonly undated: string;
}

type ConnectionTooltips = Record<
    Exclude<DeploymentFreshness, "unknown">,
    RecordedRevisionTooltip
> & { readonly unknown: string };

const NAMED_TARGET_TOOLTIPS: ConnectionTooltips = {
    deployed: {
        dated: (when) => `Deployed — last deployed ${when}`,
        undated: "Deployed — matches the last deployment",
    },
    changed: {
        dated: (when) => `Undeployed changes — last deployed ${when}`,
        undated: "Undeployed changes since the last deployment",
    },
    superseded: {
        dated: (when) => `Deployed version differs from your diagram (deployed ${when})`,
        undated: "Deployed version differs from your diagram",
    },
    unknown: "Never deployed to this target from this machine — click to switch target",
};

const FORM_VALUES_TOOLTIPS: ConnectionTooltips = {
    deployed: {
        dated: (when) => `Deployed with the form values — last deployed ${when}`,
        undated: "Deployed with the form values — matches the last deployment",
    },
    changed: {
        dated: (when) =>
            `Undeployed changes since the deployment with the form values — last deployed ${when}`,
        undated: "Undeployed changes since the last deployment with the form values",
    },
    superseded: {
        dated: (when) =>
            `Version deployed with the form values differs from your diagram (deployed ${when})`,
        undated: "Version deployed with the form values differs from your diagram",
    },
    unknown: "Never deployed with the form values from this machine — click to switch target",
};

const NO_TARGET_VIEW: StatusView = {
    text: "No deployment target",
    icon: "dot",
    tooltip: "No deployment target selected — click to choose one",
    tone: "neutral",
    action: "deploymentMenu",
};

export function deploymentStatusView(
    status: DeploymentStatus,
    formatTimestamp: TimestampFormatter,
): StatusView {
    const { connection } = status;
    if (connection.kind === "none") return NO_TARGET_VIEW;
    const named = connection.kind === "named";
    return {
        text: named ? connection.name : "Form values",
        icon: "dot",
        tooltip: freshnessTooltip(
            named ? NAMED_TARGET_TOOLTIPS : FORM_VALUES_TOOLTIPS,
            status,
            formatTimestamp,
        ),
        tone: FRESHNESS_TONES[status.freshness],
        action: "deploymentMenu",
    };
}

function freshnessTooltip(
    tooltips: ConnectionTooltips,
    { freshness, deployedAt, verifiedAt }: DeploymentStatus,
    formatTimestamp: TimestampFormatter,
): string {
    if (freshness === "unknown") return tooltips.unknown;
    const { dated, undated } = tooltips[freshness];
    const recorded = deployedAt ? dated(formatTimestamp(deployedAt)) : undated;
    return verifiedAt ? `${recorded} — verified ${formatTimestamp(verifiedAt)}` : recorded;
}
