/** @jsxImportSource @bpmn-io/properties-panel/preact */
import { useEffect, useRef, useState } from "@bpmn-io/properties-panel/preact/hooks";
import type {
    DefinitionKind,
    DefinitionUsage,
    Translate,
    WorkspaceDefinition,
} from "@miragon/bpmn-modeler-types";

import type { DefinitionSearchPort } from "./DefinitionSearchPort";
import {
    DEFINITION_SEARCH_TEXTS,
    SEARCH_STATUS_HINTS,
    type SearchStatus,
} from "./definitionSearchTexts";

const SEARCH_DEBOUNCE_MS = 150;
const MAX_LISTED_USAGES = 3;

/** Props the provider puts on the entry; the panel spreads the whole entry onto the component. */
export interface DefinitionSearchEntryProps {
    id: string;
    kind: DefinitionKind;
    search: DefinitionSearchPort["search"];
    pick: (definition: WorkspaceDefinition) => void;
    translate: Translate;
}

export function DefinitionSearchEntry(props: DefinitionSearchEntryProps) {
    const { id, kind, search, pick, translate } = props;
    const [text, setText] = useState("");
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<readonly WorkspaceDefinition[]>([]);
    const [status, setStatus] = useState<SearchStatus>("searching");
    const [activeIndex, setActiveIndex] = useState(0);
    const latestRequest = useRef(0);
    const query = text.trim();

    const inputId = `bio-properties-panel-${id}`;
    const listId = `${inputId}-results`;
    const optionId = (index: number) => `${listId}-${index}`;
    const showList = open && query !== "";

    const isLatest = (request: number) => request === latestRequest.current;

    const runSearch = (request: number) =>
        search({ kind, text: query }).then(
            (found) => {
                if (isLatest(request)) {
                    setResults(found);
                    setStatus("done");
                }
            },
            () => {
                if (isLatest(request)) {
                    setStatus("failed");
                }
            },
        );

    const definitionLabel = ({ name, code }: WorkspaceDefinition) =>
        name && code ? `${name} (${code})` : (name ?? code ?? "");

    const describeUsages = (usages: readonly DefinitionUsage[]) => {
        const byRole = (role: DefinitionUsage["role"]) => {
            const names = usages
                .filter((usage) => usage.role === role)
                .map((usage) => usage.elementName || usage.elementId);
            const listed = names.slice(0, MAX_LISTED_USAGES).join(", ");
            return names.length > MAX_LISTED_USAGES ? `${listed}, …` : listed;
        };
        const thrownBy = byRole("throw");
        const caughtBy = byRole("catch");
        return [
            thrownBy && translate(DEFINITION_SEARCH_TEXTS.thrownBy, { elements: thrownBy }),
            caughtBy && translate(DEFINITION_SEARCH_TEXTS.caughtBy, { elements: caughtBy }),
        ]
            .filter(Boolean)
            .join(" · ");
    };

    const wrap = (index: number, length: number) => (length === 0 ? 0 : (index + length) % length);

    useEffect(() => {
        const request = ++latestRequest.current;
        setResults([]);
        setActiveIndex(0);
        setStatus("searching");
        if (!open || !query) {
            return undefined;
        }
        const timer = setTimeout(() => runSearch(request), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [open, query, kind]);

    useEffect(() => {
        if (open) {
            document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
        }
    }, [open, activeIndex, results]);

    const close = () => setOpen(false);

    const choose = (definition: WorkspaceDefinition) => {
        pick(definition);
        setText("");
        close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            const step = event.key === "ArrowDown" ? 1 : -1;
            setActiveIndex((index) => wrap(index + step, results.length));
        } else if (event.key === "Enter" && showList && results[activeIndex]) {
            event.preventDefault();
            choose(results[activeIndex]);
        } else if (event.key === "Escape" && showList) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };

    return (
        <div class="bio-properties-panel-entry definition-search" data-entry-id={id}>
            <div class="bio-properties-panel-textfield">
                <label for={inputId} class="bio-properties-panel-label">
                    {translate(DEFINITION_SEARCH_TEXTS.label)}
                </label>
                <input
                    id={inputId}
                    name={id}
                    type="text"
                    class="bio-properties-panel-input"
                    role="combobox"
                    autoComplete="off"
                    spellcheck={false}
                    placeholder={translate(DEFINITION_SEARCH_TEXTS.placeholder)}
                    aria-autocomplete="list"
                    aria-expanded={showList}
                    aria-controls={listId}
                    aria-activedescendant={
                        showList && results[activeIndex] ? optionId(activeIndex) : undefined
                    }
                    value={text}
                    onInput={(event: Event) => {
                        setText((event.target as HTMLInputElement).value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onBlur={close}
                    onKeyDown={onKeyDown}
                />
                {showList && (
                    <ul
                        id={listId}
                        role="listbox"
                        class="definition-search-results"
                        aria-busy={status === "searching"}
                        onMouseDown={(event: MouseEvent) => event.preventDefault()}
                    >
                        {results.length === 0 && (
                            <li role="option" aria-disabled="true" class="definition-search-hint">
                                {translate(SEARCH_STATUS_HINTS[status])}
                            </li>
                        )}
                        {results.map((definition, index) => {
                            const usages = describeUsages(definition.usages);
                            return (
                                <li
                                    id={optionId(index)}
                                    key={`${definition.source.path}#${index}`}
                                    role="option"
                                    aria-selected={index === activeIndex}
                                    class={`definition-search-result${index === activeIndex ? " is-active" : ""}`}
                                    title={[definition.source.path, usages]
                                        .filter(Boolean)
                                        .join("\n")}
                                    onClick={() => choose(definition)}
                                    onMouseEnter={() => setActiveIndex(index)}
                                >
                                    <span class="definition-search-name">
                                        {definitionLabel(definition)}
                                    </span>
                                    <span class="definition-search-detail">
                                        {[definition.source.label, usages]
                                            .filter(Boolean)
                                            .join(" · ")}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
