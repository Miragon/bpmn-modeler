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

function existing(target: Element | null | undefined, action: string): Element {
    if (!target) {
        throw new Error(`Cannot ${action} a missing element`);
    }
    return target;
}

export function click(target: Element | null | undefined): void {
    const element = existing(target, "click");
    act(() => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
}

// mouseenter/mouseleave do not bubble, so they must be dispatched on the element itself.
export function hover(target: Element | null | undefined, entering: boolean): void {
    const element = existing(target, "hover");
    act(() => {
        element.dispatchEvent(new MouseEvent(entering ? "mouseenter" : "mouseleave"));
    });
}
