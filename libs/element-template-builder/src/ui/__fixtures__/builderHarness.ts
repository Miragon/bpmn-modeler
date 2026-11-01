import { act } from "@bpmn-io/properties-panel/preact/test-utils";
import { vi } from "vitest";

import type { Diagnostic } from "../../domain/diagnostics";
import type { TemplateEdit } from "../../domain/templateText";
import {
    createTemplateBuilder,
    type TemplateBuilderHandle,
    type TemplateBuilderOptions,
} from "../createTemplateBuilder";

type Json = Record<string, unknown>;

export const C7_SCHEMA =
    "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json";
export const C8_SCHEMA =
    "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json";

/** A mounted builder plus DOM drivers for its entries. */
export function mountBuilder({ translate }: Pick<TemplateBuilderOptions, "translate"> = {}) {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const onEdit = vi.fn<(edits: TemplateEdit[]) => void>();
    const handle: TemplateBuilderHandle = createTemplateBuilder(parent, { onEdit, translate });

    const entry = (id: string) => parent.querySelector(`[data-entry-id="${id}"]`);
    const control = (id: string) =>
        entry(id)?.querySelector("input, textarea, select") as HTMLInputElement | null;
    const click = (element: Element | null | undefined) =>
        act(() => {
            (element as HTMLElement).click();
        });

    return {
        parent,
        onEdit,
        entry,
        control,
        click,
        show(
            template: Json,
            {
                editable = true,
                diagnostics = [] as Diagnostic[],
                engine = "c8" as "c7" | "c8",
            } = {},
        ) {
            act(() => handle.show({ template, engine, editable, diagnostics }));
        },
        typeInto(target: string | Element, value: string) {
            const field = (
                typeof target === "string" ? control(target) : target
            ) as HTMLInputElement;
            field.value = value;
            act(() => {
                field.dispatchEvent(new Event("input", { bubbles: true }));
            });
        },
        // A browser fires both events on a select.
        choose(target: string | Element, value: string) {
            const field = (
                typeof target === "string" ? control(target) : target
            ) as HTMLSelectElement;
            field.value = value;
            act(() => {
                field.dispatchEvent(new Event("input", { bubbles: true }));
                field.dispatchEvent(new Event("change", { bubbles: true }));
            });
        },
        buttonLabelled(text: string) {
            return [...parent.querySelectorAll("button")].find(
                (button) => button.textContent === text,
            );
        },
        /** An icon button, found by what it says to assistive technology. */
        action(label: string) {
            return parent.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
        },
        tab(label: string) {
            click(
                [...parent.querySelectorAll('[role="tab"]')].find((tab) =>
                    tab.textContent?.startsWith(label),
                ),
            );
        },
        /** Selects the index's entry at `position`, counting what the index shows. */
        pick(position: number) {
            click(parent.querySelectorAll(".etb-index__item")[position]);
        },
        destroy() {
            act(() => handle.destroy());
            parent.remove();
        },
    };
}

export type BuilderHarness = ReturnType<typeof mountBuilder>;
