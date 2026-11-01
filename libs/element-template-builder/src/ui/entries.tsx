/** @jsxImportSource @bpmn-io/properties-panel/preact */
import type { ConditionOperator, ConditionRow } from "../domain/conditions";
import { Icon, SettingRow, type SettingProps, type Translate } from "./settings";

export interface AppliesToEntryProps extends SettingProps {
    values: readonly string[];
    options: readonly string[];
    onAdd: (value: string) => void;
    onRemove: (index: number) => void;
    translate: Translate;
}

/** The element types a template applies to, as removable chips plus a picker. */
export function AppliesToEntry(props: AppliesToEntryProps) {
    const { values, options, disabled, onAdd, onRemove, translate } = props;
    const addable = options.filter((option) => !values.includes(option));
    return (
        <SettingRow {...props}>
            <ul class="etb-chips">
                {values.map((value, index) => (
                    <li class="etb-chip" key={value}>
                        <span>{value}</span>
                        <button
                            type="button"
                            class="etb-chip__remove"
                            title={translate("Remove {value}", { value })}
                            aria-label={translate("Remove {value}", { value })}
                            disabled={disabled || values.length === 1}
                            onClick={() => onRemove(index)}
                        >
                            <Icon name="close" />
                        </button>
                    </li>
                ))}
            </ul>
            <select
                class="etb-select"
                aria-label={translate("Add an element type")}
                disabled={disabled || addable.length === 0}
                value=""
                onChange={(event: Event) => {
                    const value = (event.currentTarget as HTMLSelectElement).value;
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
        </SettingRow>
    );
}

export interface Choice {
    name: string;
    value: string;
}

export interface ChoicesEntryProps extends SettingProps {
    choices: readonly Choice[];
    onAdd: () => void;
    onChange: (index: number, key: "name" | "value", value: string) => void;
    onRemove: (index: number) => void;
    translate: Translate;
}

/** A Dropdown's choices: one row of name and value each. */
export function ChoicesEntry(props: ChoicesEntryProps) {
    const { choices, disabled, onAdd, onChange, onRemove, translate } = props;
    return (
        <SettingRow {...props}>
            {choices.length > 0 ? (
                <div class="etb-rows etb-rows--choices">
                    <span class="etb-rows__head">{translate("Name")}</span>
                    <span class="etb-rows__head">{translate("Value")}</span>
                    <span />
                    {choices.map((choice, index) => [
                        <input
                            key={`name-${index}`}
                            class="etb-input"
                            aria-label={translate("Choice name")}
                            value={choice.name}
                            disabled={disabled}
                            onInput={(event: Event) =>
                                onChange(
                                    index,
                                    "name",
                                    (event.currentTarget as HTMLInputElement).value,
                                )
                            }
                        />,
                        <input
                            key={`value-${index}`}
                            class="etb-input etb-input--mono"
                            aria-label={translate("Choice value")}
                            value={choice.value}
                            disabled={disabled}
                            onInput={(event: Event) =>
                                onChange(
                                    index,
                                    "value",
                                    (event.currentTarget as HTMLInputElement).value,
                                )
                            }
                        />,
                        <button
                            key={`remove-${index}`}
                            type="button"
                            class="etb-icon-button"
                            title={translate("Remove choice")}
                            aria-label={translate("Remove choice")}
                            disabled={disabled}
                            onClick={() => onRemove(index)}
                        >
                            <Icon name="trash" />
                        </button>,
                    ])}
                </div>
            ) : null}
            <button
                type="button"
                class="etb-button etb-button--secondary"
                disabled={disabled}
                onClick={onAdd}
            >
                {translate("Add Choice")}
            </button>
        </SettingRow>
    );
}

export interface ConditionEntryProps extends SettingProps {
    rows: readonly ConditionRow[];
    /** Ids of the properties a condition may depend on. */
    properties: readonly string[];
    onChange: (rows: ConditionRow[]) => void;
    translate: Translate;
}

const OPERATORS: readonly ConditionOperator[] = ["equals", "oneOf", "isActive", "isEmpty"];

/** When the property shows: every row must match. */
export function ConditionEntry(props: ConditionEntryProps) {
    const { rows, properties, disabled, onChange, translate } = props;
    const update = (index: number, change: Partial<ConditionRow>) =>
        onChange(rows.map((row, at) => (at === index ? { ...row, ...change } : row)));
    const operatorLabels: Record<ConditionOperator, string> = {
        equals: translate("Equals"),
        oneOf: translate("Is one of"),
        isActive: translate("Is shown"),
        isEmpty: translate("Is empty"),
    };
    return (
        <SettingRow {...props}>
            {rows.length > 0 ? (
                <div class="etb-rows etb-rows--conditions">
                    {rows.map((row, index) => [
                        <select
                            key={`property-${index}`}
                            class="etb-select"
                            aria-label={translate("Property")}
                            value={row.property}
                            disabled={disabled}
                            onChange={(event: Event) =>
                                update(index, {
                                    property: (event.currentTarget as HTMLSelectElement).value,
                                })
                            }
                        >
                            {[...new Set([row.property, ...properties])].map((property) => (
                                <option value={property} key={property}>
                                    {property || translate("Choose a property")}
                                </option>
                            ))}
                        </select>,
                        <select
                            key={`operator-${index}`}
                            class="etb-select"
                            aria-label={translate("Operator")}
                            value={row.operator}
                            disabled={disabled}
                            onChange={(event: Event) =>
                                update(index, {
                                    operator: (event.currentTarget as HTMLSelectElement)
                                        .value as ConditionOperator,
                                })
                            }
                        >
                            {OPERATORS.map((operator) => (
                                <option value={operator} key={operator}>
                                    {operatorLabels[operator]}
                                </option>
                            ))}
                        </select>,
                        row.operator === "isActive" || row.operator === "isEmpty" ? (
                            <select
                                key={`flag-${index}`}
                                class="etb-select"
                                aria-label={translate("Value")}
                                value={row.value === "false" ? "false" : "true"}
                                disabled={disabled}
                                onChange={(event: Event) =>
                                    update(index, {
                                        value: (event.currentTarget as HTMLSelectElement).value,
                                    })
                                }
                            >
                                <option value="true">{translate("Yes")}</option>
                                <option value="false">{translate("No")}</option>
                            </select>
                        ) : (
                            <input
                                key={`value-${index}`}
                                class="etb-input"
                                aria-label={translate("Value")}
                                placeholder={row.operator === "oneOf" ? translate("a, b, c") : ""}
                                value={row.value}
                                disabled={disabled}
                                onInput={(event: Event) =>
                                    update(index, {
                                        value: (event.currentTarget as HTMLInputElement).value,
                                    })
                                }
                            />
                        ),
                        <button
                            key={`remove-${index}`}
                            type="button"
                            class="etb-icon-button"
                            title={translate("Remove condition")}
                            aria-label={translate("Remove condition")}
                            disabled={disabled}
                            onClick={() => onChange(rows.filter((_, at) => at !== index))}
                        >
                            <Icon name="trash" />
                        </button>,
                    ])}
                </div>
            ) : null}
            <button
                type="button"
                class="etb-button etb-button--secondary"
                disabled={disabled}
                onClick={() =>
                    onChange([
                        ...rows,
                        { property: properties[0] ?? "", operator: "equals", value: "" },
                    ])
                }
            >
                {translate("Add Condition")}
            </button>
        </SettingRow>
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
        <p class="etb-note" data-entry-id={id}>
            {translate("Also set in the JSON: {keys}", { keys: keys.join(", ") })}
        </p>
    );
}
