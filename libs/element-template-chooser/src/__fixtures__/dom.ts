import { act } from "preact/test-utils";

export function typeInto(input: HTMLInputElement, text: string): void {
    act(() => {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
    });
}

export function pressKey(target: EventTarget, key: string): void {
    act(() => {
        target.dispatchEvent(
            new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
        );
    });
}

export function click(target: Element | null, type: "click" | "dblclick" = "click"): void {
    if (!target) {
        throw new Error(`Cannot ${type} a missing element`);
    }
    act(() => {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true }));
    });
}
