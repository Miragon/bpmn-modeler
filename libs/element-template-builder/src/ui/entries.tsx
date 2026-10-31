/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { useError } from "@bpmn-io/properties-panel";

import type { ConditionOperator, ConditionRow } from "../domain/conditions";
import type { Diagnostic } from "../domain/diagnostics";

export type Translate = (template: string, replacements?: Record<string, string>) => string;

function ErrorText({ id }: { id: string }) {
    const error: string | undefined = useError(id);
    return error ? <div class="bio-properties-panel-error">{error}</div> : null;
}

export interface AppliesToEntryProps {
    id: string;
    label: string;
    values: readonly string[];
    options: readonly string[];
    disabled: boolean;
    onAdd: (value: string) => void;
    onRemove: (index: number) => void;
    translate: Translate;
}

/** The element types a template applies to, as removable chips plus a picker. */
export function AppliesToEntry(props: AppliesToEntryProps) {
    const { id, label, values, options, disabled, onAdd, onRemove, translate } = props;
    const addable = options.filter((option) => !values.includes(option));
    return (
        <div class="bio-properties-panel-entry etb-entry" data-entry-id={id}>
            <label class="bio-properties-panel-label">{label}</label>
            <ul class="etb-chips">
                {values.map((value, index) => (
                    <li class="etb-chip" key={value}>
                        <span>{value}</span>
                        <button
                            type="button"
                            class="etb-chip__remove"
                            title={translate("Remove {value}", { value })}
                            disabled={disabled || values.length === 1}
                            onClick={() => onRemove(index)}
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>
            <select
                class="bio-properties-panel-input"
                aria-label={translate("Add an element type")}
                disabled={disabled || addable.length === 0}
                value=""
                onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (value) {
                        onAdd(value);
                    }
                }}
            >
                <option value="">{translate("Add an element type…")}</option>
                {addable.map((option) => (
                    <option value={option} key={option}>
                        {option}
                    </option>
                ))}
            </select>
            <ErrorText id={id} />
        </div>
    );
}

export interface Choice {
    name: string;
    value: string;
}

export interface ChoicesEntryProps {
    id: string;
    label: string;
    choices: readonly Choice[];
    disabled: boolean;
    onAdd: () => void;
    onChange: (index: number, key: "name" | "value", value: string) => void;
    onRemove: (index: number) => void;
    translate: Translate;
}

/** A Dropdown's choices: one row of name and value each. */
export function ChoicesEntry(props: ChoicesEntryProps) {
    const { id, label, choices, disabled, onAdd, onChange, onRemove, translate } = props;
    return (
        <div class="bio-properties-panel-entry etb-entry" data-entry-id={id}>
            <label class="bio-properties-panel-label">{label}</label>
            {choices.map((choice, index) => (
                <div class="etb-row" key={index}>
                    <input
                        class="bio-properties-panel-input"
                        aria-label={translate("Choice name")}
                        value={choice.name}
                        disabled={disabled}
                        onInput={(event) => onChange(index, "name", event.currentTarget.value)}
                    />
                    <input
                        class="bio-properties-panel-input"
                        aria-label={translate("Choice value")}
                        value={choice.value}
                        disabled={disabled}
                        onInput={(event) => onChange(index, "value", event.currentTarget.value)}
                    />
                    <button
                        type="button"
                        class="etb-icon-button"
                        title={translate("Remove choice")}
                        disabled={disabled}
                        onClick={() => onRemove(index)}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button type="button" class="etb-button" disabled={disabled} onClick={onAdd}>
                {translate("Add choice")}
            </button>
            <ErrorText id={id} />
        </div>
    );
}

export interface ConditionEntryProps {
    id: string;
    label: string;
    rows: readonly ConditionRow[];
    /** Ids of the properties a condition may depend on. */
    properties: readonly string[];
    disabled: boolean;
    onChange: (rows: ConditionRow[]) => void;
    translate: Translate;
}

const OPERATORS: readonly ConditionOperator[] = ["equals", "oneOf", "isActive", "isEmpty"];

/** When the property shows: every row must match. */
export function ConditionEntry(props: ConditionEntryProps) {
    const { id, label, rows, properties, disabled, onChange, translate } = props;
    const update = (index: number, change: Partial<ConditionRow>) =>
        onChange(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
    const operatorLabels: Record<ConditionOperator, string> = {
        equals: translate("equals"),
        oneOf: translate("is one of"),
        isActive: translate("is shown"),
        isEmpty: translate("is empty"),
    };
    return (
        <div class="bio-properties-panel-entry etb-entry" data-entry-id={id}>
            <label class="bio-properties-panel-label">{label}</label>
            {rows.map((row, index) => (
                <div class="etb-row" key={index}>
                    <select
                        class="bio-properties-panel-input"
                        aria-label={translate("Property")}
                        value={row.property}
                        disabled={disabled}
                        onChange={(event) => update(index, { property: event.currentTarget.value })}
                    >
                        {[...new Set([row.property, ...properties])].map((property) => (
                            <option value={property} key={property}>
                                {property || translate("Choose a property")}
                            </option>
                        ))}
                    </select>
                    <select
                        class="bio-properties-panel-input"
                        aria-label={translate("Operator")}
                        value={row.operator}
                        disabled={disabled}
                        onChange={(event) =>
                            update(index, {
                                operator: event.currentTarget.value as ConditionOperator,
                            })
                        }
                    >
                        {OPERATORS.map((operator) => (
                            <option value={operator} key={operator}>
                                {operatorLabels[operator]}
                            </option>
                        ))}
                    </select>
                    {row.operator === "isActive" || row.operator === "isEmpty" ? (
                        <select
                            class="bio-properties-panel-input"
                            aria-label={translate("Value")}
                            value={row.value === "false" ? "false" : "true"}
                            disabled={disabled}
                            onChange={(event) =>
                                update(index, { value: event.currentTarget.value })
                            }
                        >
                            <option value="true">{translate("yes")}</option>
                            <option value="false">{translate("no")}</option>
                        </select>
                    ) : (
                        <input
                            class="bio-properties-panel-input"
                            aria-label={translate("Value")}
                            placeholder={row.operator === "oneOf" ? translate("a, b, c") : ""}
                            value={row.value}
                            disabled={disabled}
                            onInput={(event) => update(index, { value: event.currentTarget.value })}
                        />
                    )}
                    <button
                        type="button"
                        class="etb-icon-button"
                        title={translate("Remove condition")}
                        disabled={disabled}
                        onClick={() => onChange(rows.filter((_, at) => at !== index))}
                    >
                        ×
                    </button>
                </div>
            ))}
            <button
                type="button"
                class="etb-button"
                disabled={disabled}
                onClick={() =>
                    onChange([
                        ...rows,
                        { property: properties[0] ?? "", operator: "equals", value: "" },
                    ])
                }
            >
                {translate("Add condition")}
            </button>
            <ErrorText id={id} />
        </div>
    );
}

export interface Problem extends Diagnostic {
    /** The entry showing the problem's value, if any. */
    entryId?: string;
}

export interface ProblemsEntryProps {
    id: string;
    problems: readonly Problem[];
    disabled: boolean;
    onFix: (problem: Problem) => void;
    onShow: (problem: Problem) => void;
    translate: Translate;
}

/** Everything the builder and the validator found, with a way to each and a fix where one exists. */
export function ProblemsEntry(props: ProblemsEntryProps) {
    const { id, problems, disabled, onFix, onShow, translate } = props;
    return (
        <ul class="bio-properties-panel-entry etb-problems" data-entry-id={id}>
            {problems.map((problem, index) => (
                <li class={`etb-problem etb-problem--${problem.severity}`} key={index}>
                    <span class="etb-problem__message">{translate(problem.message)}</span>
                    {problem.entryId ? (
                        <button type="button" class="etb-link" onClick={() => onShow(problem)}>
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
    );
}

/** Keys the builder does not edit, which stay as they are in the JSON. */
export function JsonOnlyEntry({
    id,
    keys,
    translate,
}: {
    id: string;
    keys: readonly string[];
    translate: Translate;
}) {
    return (
        <div class="bio-properties-panel-entry etb-json-only" data-entry-id={id}>
            {translate("Also set in the JSON: {keys}", { keys: keys.join(", ") })}
        </div>
    );
}
