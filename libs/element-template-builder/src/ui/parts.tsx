/** @jsxImportSource @bpmn-io/properties-panel/preact */
import type { ComponentChildren } from "@bpmn-io/properties-panel/preact";

import type { EntryDiagnostic } from "./entryIds";
import { SeverityIcon } from "./ProblemsBar";
import { Icon } from "./settings";

export function Heading({
    title,
    meta,
    children,
}: {
    title: string;
    meta?: string;
    children?: ComponentChildren;
}) {
    return (
        <div class="etb-heading">
            <h2 class="etb-heading__title">{title}</h2>
            {meta ? <span class="etb-heading__meta">{meta}</span> : null}
            {children ? <span class="etb-heading__actions">{children}</span> : null}
        </div>
    );
}

export function Action({
    icon,
    label,
    disabled,
    onClick,
}: {
    icon: Parameters<typeof Icon>[0]["name"];
    label: string;
    disabled?: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            class="etb-icon-button"
            title={label}
            aria-label={label}
            disabled={disabled}
            onClick={onClick}
        >
            <Icon name={icon} />
        </button>
    );
}

export interface IndexItem {
    index: number;
    title: string;
    severity?: EntryDiagnostic["severity"];
}

/** The left column: what the tab lists, like the table of contents of VS Code's settings. */
export function Index({
    label,
    items,
    selected,
    onSelect,
    empty,
    addLabel,
    onAdd,
}: {
    label: string;
    items: readonly IndexItem[];
    selected: number | undefined;
    onSelect: (index: number) => void;
    empty: string;
    addLabel: string;
    onAdd?: () => void;
}) {
    return (
        <nav class="etb-index" aria-label={label}>
            {items.length > 0 ? (
                <ul class="etb-index__list">
                    {items.map(({ index, title, severity }) => (
                        <li key={index}>
                            <button
                                type="button"
                                class={`etb-index__item${index === selected ? " etb-index__item--selected" : ""}`}
                                aria-current={index === selected ? "true" : undefined}
                                title={title}
                                onClick={() => onSelect(index)}
                            >
                                <span class="etb-index__label">{title}</span>
                                {severity ? <SeverityIcon kind={severity} /> : null}
                            </button>
                        </li>
                    ))}
                </ul>
            ) : (
                <p class="etb-index__empty">{empty}</p>
            )}
            {onAdd ? (
                <button type="button" class="etb-button etb-button--secondary" onClick={onAdd}>
                    <Icon name="add" />
                    {addLabel}
                </button>
            ) : null}
        </nav>
    );
}

/** What a search found on other tabs, where this one shows nothing. */
export function OtherMatches({
    matches,
}: {
    matches: readonly { label: string; open: () => void }[];
}) {
    return matches.length > 0 ? (
        <p class="etb-other-matches">
            {matches.map(({ label, open }) => (
                <button type="button" class="etb-link" key={label} onClick={open}>
                    {label}
                </button>
            ))}
        </p>
    ) : null;
}
