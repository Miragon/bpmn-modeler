import { ELEMENT_ID_GROUPS } from "@miragon/bpmn-modeler-types";
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import type { ElementIdProposal } from "../ElementIdsService";
import type { Translate } from "../translate";
import { iconClassOf } from "../typeIcons";

export interface ReviewPanelProps {
    /** The rows that start unchecked; later changes to it are ignored. */
    readonly initialUnchecked: ReadonlySet<string>;
    /** Bumped on every diagram change, so the proposals follow edits made while the panel is open. */
    readonly revision: number;
    readonly propose: (unchecked: ReadonlySet<string>) => ElementIdProposal[];
    readonly onApply: (unchecked: ReadonlySet<string>) => void;
    readonly onClose: () => void;
    readonly onReveal: (proposal: ElementIdProposal) => void;
    readonly translate: Translate;
}

const MATCHES = "matches";
const SKIPPED = "skipped";

function Chevron({ open }: { open: boolean }) {
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path
                d={open ? "M4 6l4 4 4-4" : "M6 4l4 4-4 4"}
                fill="none"
                stroke="currentColor"
                stroke-width="1.3"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </svg>
    );
}

function TypeIcon({ type }: { type: string }) {
    return <span class={`eid-type ${iconClassOf(type)}`} aria-hidden="true" />;
}

function GroupCheckbox({
    checked,
    mixed,
    label,
    onChange,
}: {
    checked: boolean;
    mixed: boolean;
    label: string;
    onChange: (checked: boolean) => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (ref.current) {
            ref.current.indeterminate = mixed;
        }
    }, [mixed]);
    return (
        <input
            ref={ref}
            type="checkbox"
            class="eid-check"
            checked={checked}
            aria-label={label}
            onChange={(event) => onChange((event.currentTarget as HTMLInputElement).checked)}
        />
    );
}

/**
 * The review: every ID a name would change, grouped by kind as VS Code's
 * Refactor Preview groups a rename, with the old ID struck through beside the
 * new one. Apply renames the checked rows in one undo step.
 */
export function ReviewPanel(props: ReviewPanelProps) {
    const { revision, propose, onApply, onClose, onReveal, translate } = props;
    const [unchecked, setUnchecked] = useState(props.initialUnchecked);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set([MATCHES, SKIPPED]));
    const root = useRef<HTMLElement>(null);
    const firstAction = useRef<HTMLButtonElement>(null);

    // `revision` is a dependency on purpose: the diagram changed under the same inputs.
    const proposals = useMemo(() => propose(unchecked), [propose, unchecked, revision]);
    const changing = proposals.filter((p) => p.status === "rename" || p.status === "unchecked");
    const renamed = changing.filter((p) => p.status === "rename").length;
    const matches = proposals.filter((p) => p.status === "matches");
    const skipped = proposals.filter((p) => p.status === "skipped");

    useEffect(() => {
        firstAction.current?.focus();
    }, []);

    useEffect(() => {
        const element = root.current;
        // Capture phase: the canvas would otherwise take Escape to refocus itself.
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onClose();
            }
        };
        element?.addEventListener("keydown", onKeyDown, true);
        return () => element?.removeEventListener("keydown", onKeyDown, true);
    }, [onClose]);

    const setChecked = (ids: readonly string[], checked: boolean) =>
        setUnchecked((current) => {
            const next = new Set(current);
            for (const id of ids) {
                if (checked) {
                    next.delete(id);
                } else {
                    next.add(id);
                }
            }
            return next;
        });

    const toggleCollapsed = (key: string) =>
        setCollapsed((current) => {
            const next = new Set(current);
            if (!next.delete(key)) {
                next.add(key);
            }
            return next;
        });

    const groupHead = (key: string, label: string, count: number, checkbox?: ComponentChildren) => (
        <div class="eid-group-head">
            <button
                type="button"
                class="eid-twistie"
                aria-expanded={!collapsed.has(key)}
                aria-label={label}
                onClick={() => toggleCollapsed(key)}
            >
                <Chevron open={!collapsed.has(key)} />
            </button>
            {checkbox}
            <span class="eid-group-label">{label}</span>
            <span class="eid-count">{count}</span>
        </div>
    );

    const renameRow = (proposal: ElementIdProposal) => {
        const { candidate, status, newId, clash } = proposal;
        const checked = status === "rename";
        return (
            <li key={candidate.id} class={checked ? "eid-row" : "eid-row eid-off"}>
                <input
                    type="checkbox"
                    class="eid-check"
                    checked={checked}
                    aria-label={translate("Rename {name}", { name: candidate.name })}
                    onChange={(event) =>
                        setChecked(
                            [candidate.id],
                            (event.currentTarget as HTMLInputElement).checked,
                        )
                    }
                />
                <button
                    type="button"
                    class="eid-row-main"
                    aria-label={translate("{name}: {oldId} becomes {newId}", {
                        name: candidate.name,
                        oldId: candidate.id,
                        newId: newId ?? "",
                    })}
                    onClick={() => onReveal(proposal)}
                >
                    <TypeIcon type={candidate.type} />
                    <span class="eid-name">{candidate.name}</span>
                    <span class="eid-ids">
                        <span class="eid-old">{candidate.id}</span>
                        <span class="eid-new">
                            <mark>{newId}</mark>
                        </span>
                        {clash && (
                            <span class="eid-tag">{translate("same name as another element")}</span>
                        )}
                    </span>
                </button>
            </li>
        );
    };

    const plainRow = (proposal: ElementIdProposal) => (
        <li key={proposal.candidate.id} class="eid-row eid-plain">
            <button type="button" class="eid-row-main" onClick={() => onReveal(proposal)}>
                <TypeIcon type={proposal.candidate.type} />
                <span class="eid-name">{proposal.candidate.name || translate("No name")}</span>
                <span class="eid-ids">
                    <span class="eid-id">{proposal.candidate.id}</span>
                </span>
            </button>
        </li>
    );

    const emptyText =
        matches.length > 0 ? "Every ID already follows its name." : "No element has a name yet.";

    return (
        <section
            ref={root}
            class="eid-panel"
            role="region"
            aria-label={translate("Generate IDs from names")}
        >
            <header class="eid-bar">
                <h2 class="eid-title">{translate("Generate IDs from names")}</h2>
                <span class="eid-summary" role="status">
                    {translate("{count} of {total} IDs will change", {
                        count: String(renamed),
                        total: String(changing.length),
                    })}
                </span>
                <div class="eid-tools">
                    <button
                        ref={firstAction}
                        type="button"
                        class="eid-btn eid-primary"
                        disabled={renamed === 0}
                        onClick={() => onApply(unchecked)}
                    >
                        {translate("Apply")}
                    </button>
                    <button type="button" class="eid-btn" onClick={onClose}>
                        {translate("Discard")}
                    </button>
                    <button
                        type="button"
                        class="eid-icon-btn"
                        aria-label={translate("Close")}
                        title={translate("Close")}
                        onClick={onClose}
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                            <path
                                d="M4 4l8 8M12 4l-8 8"
                                stroke="currentColor"
                                stroke-width="1.2"
                                stroke-linecap="round"
                            />
                        </svg>
                    </button>
                </div>
            </header>
            <div class="eid-tree">
                {changing.length === 0 && <p class="eid-empty">{translate(emptyText)}</p>}
                {ELEMENT_ID_GROUPS.map(({ kind, label }) => {
                    const rows = changing.filter((p) => p.candidate.kind === kind);
                    if (rows.length === 0) {
                        return null;
                    }
                    const checkedRows = rows.filter((p) => p.status === "rename").length;
                    const ids = rows.map((p) => p.candidate.id);
                    const groupLabel = translate(label);
                    return (
                        <div key={kind} class="eid-group" role="group" aria-label={groupLabel}>
                            {groupHead(
                                kind,
                                groupLabel,
                                rows.length,
                                <GroupCheckbox
                                    checked={checkedRows === rows.length}
                                    mixed={checkedRows > 0 && checkedRows < rows.length}
                                    label={translate("Rename all {group}", { group: groupLabel })}
                                    onChange={(checked) => setChecked(ids, checked)}
                                />,
                            )}
                            {!collapsed.has(kind) && (
                                <ul class="eid-rows">{rows.map(renameRow)}</ul>
                            )}
                        </div>
                    );
                })}
                {[
                    { key: MATCHES, label: translate("Already match"), rows: matches },
                    { key: SKIPPED, label: translate("No name, skipped"), rows: skipped },
                ].map(
                    ({ key, label, rows }) =>
                        rows.length > 0 && (
                            <div
                                key={key}
                                class="eid-group eid-group-quiet"
                                role="group"
                                aria-label={label}
                            >
                                {groupHead(key, label, rows.length)}
                                {!collapsed.has(key) && (
                                    <ul class="eid-rows">{rows.map(plainRow)}</ul>
                                )}
                            </div>
                        ),
                )}
            </div>
            <footer class="eid-foot">
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                    <circle
                        cx="8"
                        cy="8"
                        r="6"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.2"
                    />
                    <path
                        d="M8 7.2v3.6"
                        stroke="currentColor"
                        stroke-width="1.3"
                        stroke-linecap="round"
                    />
                    <circle cx="8" cy="5.1" r=".75" fill="currentColor" />
                </svg>
                {translate(
                    "IDs used in other files (call activities, tests, workers) are not updated. Apply is one undo step.",
                )}
            </footer>
        </section>
    );
}
