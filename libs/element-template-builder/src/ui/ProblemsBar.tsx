/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { useState } from "@bpmn-io/properties-panel/preact/hooks";

import type { Diagnostic } from "../domain/diagnostics";
import type { Translate } from "./settings";

export interface Problem extends Diagnostic {
    /** The entry showing the problem's value, if any. */
    entryId?: string;
    /** The property or group the problem is about. */
    where?: string;
}

export interface ProblemsBarProps {
    problems: readonly Problem[];
    disabled: boolean;
    onFix: (problem: Problem) => void;
    onShow: (problem: Problem) => void;
    translate: Translate;
}

type IconKind = Diagnostic["severity"] | "success";

// bpmn-js-bpmnlint's icons, so the builder reports problems like the modeler's lint summary.
const ICONS: Readonly<Record<IconKind, { viewBox: string; path: string }>> = {
    error: {
        viewBox: "0 0 512 512",
        path: "M339.07 256 463.67 131.4c15.29-15.29 15.29-40.08 0-55.38l-27.69-27.69c-15.29-15.29-40.08-15.29-55.38 0L256 172.93 131.4 48.33c-15.29-15.29-40.08-15.29-55.38 0L48.33 76.02c-15.29 15.29-15.29 40.08 0 55.38L172.93 256 48.33 380.6c-15.29 15.29-15.29 40.08 0 55.38l27.69 27.69c15.29 15.29 40.09 15.29 55.38 0L256 339.07l124.6 124.6c15.29 15.29 40.09 15.29 55.38 0l27.69-27.69c15.29-15.29 15.29-40.08 0-55.38z",
    },
    warning: {
        viewBox: "0 0 512 512",
        path: "m256 323.95c-45.518 0-82.419 34.576-82.419 77.229 0 42.652 36.9 77.229 82.419 77.229 45.518 0 82.419-34.577 82.419-77.23 0-42.652-36.9-77.229-82.419-77.229zm-80.561-271.8 11.61 204.35c.544 9.334 8.78 16.64 18.755 16.64h100.39c9.975 0 18.211-7.306 18.754-16.64l11.611-204.35c.587-10.082-7.98-18.56-18.754-18.56h-123.62c-10.775 0-19.34 8.478-18.753 18.56z",
    },
    info: {
        viewBox: "3.5 3.5 9 9",
        path: "M6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
    },
    success: {
        viewBox: "0 0 512 512",
        path: "m173.9 439.4-166.4-166.4c-10-10-10-26.21 0-36.2l36.2-36.2c10-10 26.21-10 36.2 0L192 312.69 432.1 72.6c10-10 26.21-10 36.2 0l36.2 36.2c10 10 10 26.21 0 36.2l-294.4 294.4c-10 10-26.21 10-36.2 0z",
    },
};

const SEVERITY_ORDER: readonly Diagnostic["severity"][] = ["error", "warning", "info"];

export function SeverityIcon({ kind }: { kind: IconKind }) {
    const { viewBox, path } = ICONS[kind];
    return (
        <svg
            class={`etb-icon etb-icon--${kind}`}
            viewBox={viewBox}
            aria-hidden="true"
            focusable="false"
        >
            <path fill="currentColor" d={path} />
        </svg>
    );
}

/** A summary chip at the bottom of the form that opens the list of problems above itself. */
export function ProblemsBar({ problems, disabled, onFix, onShow, translate }: ProblemsBarProps) {
    const [open, setOpen] = useState(false);
    const errors = problems.filter((problem) => problem.severity === "error").length;
    const warnings = problems.filter((problem) => problem.severity === "warning").length;
    const state: IconKind = errors ? "error" : warnings ? "warning" : "success";
    const expanded = open && problems.length > 0;
    const listed = [...problems].sort(
        (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
    );
    return (
        <div class="etb-problems">
            {expanded ? (
                <ul class="etb-problems__list" aria-label={translate("Problems")}>
                    {listed.map((problem, index) => (
                        <li class={`etb-problem etb-problem--${problem.severity}`} key={index}>
                            <SeverityIcon kind={problem.severity} />
                            <span class="etb-problem__message">
                                {problem.where ? (
                                    <span class="etb-problem__where">{problem.where}: </span>
                                ) : null}
                                {problem.message}
                            </span>
                            {problem.entryId ? (
                                <button
                                    type="button"
                                    class="etb-link"
                                    onClick={() => onShow(problem)}
                                >
                                    {translate("Show")}
                                </button>
                            ) : null}
                            {problem.fix ? (
                                <button
                                    type="button"
                                    class="etb-button"
                                    disabled={disabled}
                                    onClick={() => onFix(problem)}
                                >
                                    {translate(problem.fix.label)}
                                </button>
                            ) : null}
                        </li>
                    ))}
                </ul>
            ) : null}
            <button
                type="button"
                class={`etb-problems__chip etb-problems__chip--${state}`}
                aria-expanded={expanded}
                disabled={problems.length === 0}
                onClick={() => setOpen(!open)}
            >
                <SeverityIcon kind={state} />
                <span>
                    {translate(
                        errors || warnings ? "{errors} Errors, {warnings} Warnings" : "No Issues",
                        { errors: String(errors), warnings: String(warnings) },
                    )}
                </span>
            </button>
        </div>
    );
}
