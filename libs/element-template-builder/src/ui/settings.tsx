/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { type ComponentChildren, createContext } from "@bpmn-io/properties-panel/preact";
import { useContext, useState } from "@bpmn-io/properties-panel/preact/hooks";

import type { Translate } from "../domain/translate";
import type { EntryDiagnostic } from "./entryIds";

export type { Translate };

/** What a setting's title names first, like the "Editor:" in VS Code's "Editor: Font Size". */
export const SettingScope = createContext<string | undefined>(undefined);

const PATHS = {
    search: "M10.02 10.73a4.5 4.5 0 1 1 .7-.7l3.13 3.12-.7.71-3.13-3.13zM6.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    close: "M8 8.7l3.65 3.65.7-.7L8.71 8l3.64-3.65-.7-.7L8 7.29 4.35 3.65l-.7.7L7.29 8l-3.64 3.65.7.7L8 8.71z",
    add: "M14 7.5v1H8.5V14h-1V8.5H2v-1h5.5V2h1v5.5H14z",
    arrowUp: "M3.65 6.65l4-4h.7l4 4-.7.7L8.5 4.21V13.5h-1V4.2L4.35 7.36l-.7-.71z",
    arrowDown: "M12.35 9.35l-4 4h-.7l-4-4 .7-.7 3.15 3.14V2.5h1v9.29l3.15-3.14.7.7z",
    copy: "M4 4l1-1h5.41L14 6.59V14l-1 1H5l-1-1V4zm9 3l-3-3H5v10h8V7zM3 1L2 2v10l1 1V2h6.41l-1-1H3z",
    trash: "M10 3h3v1h-1v9l-1 1H5l-1-1V4H3V3h3V2a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1zM9 2H7v1h2V2zM5 4v9h6V4H5zm1 2h1v5H6V6zm3 0h1v5H9V6z",
};

/** Codicon-shaped icons, drawn in the current text colour. */
export function Icon({ name }: { name: keyof typeof PATHS }) {
    return (
        <svg class="etb-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path fill="currentColor" fill-rule="evenodd" d={PATHS[name]} />
        </svg>
    );
}

export interface SettingProps {
    id: string;
    label: string;
    description?: string;
    disabled?: boolean;
    /** Whether the JSON sets this value; VS Code marks such settings at their left edge. */
    modified?: boolean;
    message?: EntryDiagnostic;
}

const controlIdOf = (id: string) => `${id}-control`;
const titleIdOf = (id: string) => `${id}-title`;
const descriptionIdOf = (id: string) => `${id}-description`;

/** One row of the settings list: scoped title, description, control and what is wrong with it. */
export function SettingRow({
    id,
    label,
    description,
    modified,
    message,
    children,
}: SettingProps & { children: ComponentChildren }) {
    const scope = useContext(SettingScope);
    return (
        <div class={`etb-setting${modified ? " etb-setting--modified" : ""}`} data-entry-id={id}>
            <div class="etb-setting__title" id={titleIdOf(id)}>
                {scope ? <span class="etb-setting__scope">{scope}: </span> : null}
                <span class="etb-setting__name">{label}</span>
            </div>
            {description ? (
                <div class="etb-setting__description" id={descriptionIdOf(id)}>
                    {description}
                </div>
            ) : null}
            <div class="etb-setting__control">{children}</div>
            {message ? (
                <div class={`etb-validation etb-validation--${message.severity}`}>
                    {message.message}
                </div>
            ) : null}
        </div>
    );
}

function labelling({ id, description }: SettingProps) {
    return {
        "id": controlIdOf(id),
        "aria-labelledby": titleIdOf(id),
        "aria-describedby": description ? descriptionIdOf(id) : undefined,
    };
}

export interface DraftOptions {
    /** What text means once written, such as `1` for `1.`; the file holds that, the field the text. */
    normalize?: (text: string) => string;
    /** A message for text that must not reach the template; the field keeps it until it is fixed. */
    validate?: (text: string) => string | null;
}

/**
 * The text a field shows for the file's `value`. What was typed stays while it
 * still means that value, so the file's spelling of it (`1` for `1.`, `a` for
 * `a,`) does not eat the next keystroke; a change from elsewhere replaces it.
 */
export function useDraft(
    value: string,
    { normalize = (text) => text, validate }: DraftOptions = {},
): { text: string; error: string | null; onType: (text: string, write: () => void) => void } {
    const [draft, setDraft] = useState<{ text: string; base: string }>();
    const message = draft ? (validate?.(draft.text) ?? null) : null;
    const current =
        draft && (message ? draft.base === value : normalize(draft.text) === value)
            ? draft
            : undefined;
    return {
        text: current?.text ?? value,
        error: current ? message : null,
        onType(text, write) {
            setDraft({ text, base: value });
            if (!validate?.(text)) {
                write();
            }
        },
    };
}

export interface TextSettingProps extends SettingProps, DraftOptions {
    area?: boolean;
    mono?: boolean;
    placeholder?: string;
    getValue: () => string;
    setValue: (value: string) => void;
}

export function TextSetting(props: TextSettingProps) {
    const { area, mono, placeholder, disabled, getValue, setValue, normalize, validate } = props;
    const { text, error, onType } = useDraft(getValue(), { normalize, validate });
    const onInput = (event: Event) => {
        const typed = (event.currentTarget as HTMLInputElement).value;
        onType(typed, () => setValue(typed));
    };
    const control = {
        ...labelling(props),
        class: `etb-input${mono ? " etb-input--mono" : ""}${area ? " etb-input--area" : ""}`,
        value: text,
        placeholder,
        disabled,
        spellcheck: false,
        onInput,
    };
    return (
        <SettingRow
            {...props}
            message={error ? { severity: "error", message: error } : props.message}
        >
            {area ? <textarea rows={2} {...control} /> : <input type="text" {...control} />}
        </SettingRow>
    );
}

export interface SelectOption {
    value: string;
    label: string;
    /** The heading it comes under, after the options without one. */
    group?: string;
    /** There only to say that it exists. */
    disabled?: boolean;
}

export interface SelectSettingProps extends SettingProps {
    getValue: () => string;
    getOptions: () => SelectOption[];
    setValue: (value: string) => void;
}

function optionOf({ value, label, disabled }: SelectOption) {
    return (
        <option value={value} key={value} disabled={disabled}>
            {label}
        </option>
    );
}

export function SelectSetting(props: SelectSettingProps) {
    const { disabled, getValue, getOptions, setValue } = props;
    const options = getOptions();
    const groups = [...new Set(options.flatMap(({ group }) => (group ? [group] : [])))];
    return (
        <SettingRow {...props}>
            <select
                {...labelling(props)}
                class="etb-select"
                value={getValue()}
                disabled={disabled}
                onChange={(event: Event) =>
                    setValue((event.currentTarget as HTMLSelectElement).value)
                }
            >
                {options.filter(({ group }) => !group).map(optionOf)}
                {groups.map((group) => (
                    <optgroup label={group} key={group}>
                        {options.filter((option) => option.group === group).map(optionOf)}
                    </optgroup>
                ))}
            </select>
        </SettingRow>
    );
}

export interface CheckSettingProps extends SettingProps {
    getValue: () => boolean;
    setValue: (value: boolean) => void;
}

/** VS Code's boolean setting: the title above, the checkbox beside what checking it means. */
export function CheckSetting(props: CheckSettingProps) {
    const { description, disabled, getValue, setValue } = props;
    return (
        <SettingRow {...props} description={undefined}>
            <label class="etb-check">
                <input
                    type="checkbox"
                    id={controlIdOf(props.id)}
                    aria-labelledby={titleIdOf(props.id)}
                    class="etb-checkbox"
                    checked={getValue()}
                    disabled={disabled}
                    onChange={(event: Event) =>
                        setValue((event.currentTarget as HTMLInputElement).checked)
                    }
                />
                <span>{description}</span>
            </label>
        </SettingRow>
    );
}

export function SettingSection({ title }: { title: string }) {
    return <h3 class="etb-section">{title}</h3>;
}
