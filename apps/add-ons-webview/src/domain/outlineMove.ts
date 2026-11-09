import { Expansion, isOpen, OutlineHead } from "./outline";

const OUTLINE_KEYS = [
    "ArrowDown",
    "ArrowUp",
    "Home",
    "End",
    "ArrowRight",
    "ArrowLeft",
    "Enter",
    " ",
] as const;

export type OutlineKey = (typeof OUTLINE_KEYS)[number];

export type OutlineMove =
    | { readonly kind: "focus"; readonly headId: string }
    | { readonly kind: "toggle"; readonly headId: string }
    | { readonly kind: "controls"; readonly headId: string }
    /** A header is a button: Enter and Space toggle it through its own press. */
    | { readonly kind: "press"; readonly headId: string }
    | { readonly kind: "none" };

const NONE: OutlineMove = { kind: "none" };

/** Letters typed further apart than this start a new search. */
const TYPE_AHEAD_GAP_MS = 500;

export function isOutlineKey(key: string): key is OutlineKey {
    return (OUTLINE_KEYS as readonly string[]).includes(key);
}

type Mover = (
    head: OutlineHead,
    index: number,
    visible: readonly OutlineHead[],
    open: boolean,
) => OutlineMove;

const focus = (head: OutlineHead | undefined): OutlineMove =>
    head === undefined ? NONE : { kind: "focus", headId: head.id };

const activate: Mover = (head) =>
    head.openByDefault === undefined
        ? { kind: "controls", headId: head.id }
        : { kind: "press", headId: head.id };

const MOVES: Record<OutlineKey, Mover> = {
    "ArrowDown": (_head, index, visible) => focus(visible[index + 1]),
    "ArrowUp": (_head, index, visible) => focus(visible[index - 1]),
    "Home": (_head, _index, visible) => focus(visible[0]),
    "End": (_head, _index, visible) => focus(visible[visible.length - 1]),
    "ArrowRight": (head, index, visible, open) => {
        if (head.openByDefault === undefined) return NONE;
        return open ? focus(visible[index + 1]) : { kind: "toggle", headId: head.id };
    },
    "ArrowLeft": (head, _index, visible, open) =>
        open
            ? { kind: "toggle", headId: head.id }
            : focus(visible.find(({ id }) => id === head.parentId)),
    "Enter": activate,
    " ": activate,
};

/** What a key does on the active head; an open header's next head is its first child. */
export function outlineMoveOf(
    key: OutlineKey,
    activeId: string,
    visible: readonly OutlineHead[],
    expansion: Expansion,
): OutlineMove {
    const index = visible.findIndex(({ id }) => id === activeId);
    if (index === -1) return NONE;
    const head = visible[index];
    return MOVES[key](head, index, visible, isOpen(head, expansion));
}

export interface TypeAhead {
    readonly text: string;
    readonly at: number;
}

/** @param at the key event's time stamp, so no timer is needed */
export function typedAhead(previous: TypeAhead | undefined, char: string, at: number): TypeAhead {
    const continues = previous !== undefined && at - previous.at <= TYPE_AHEAD_GAP_MS;
    return { text: continues ? previous.text + char : char, at };
}

/** A first letter moves on from the active head; more letters keep it while it still matches. */
export function typeAheadTarget(
    typed: TypeAhead,
    activeId: string,
    visible: readonly OutlineHead[],
): string | undefined {
    const index = visible.findIndex(({ id }) => id === activeId);
    const start = typed.text.length > 1 ? index : index + 1;
    const ordered = [...visible.slice(start), ...visible.slice(0, start)];
    const text = typed.text.toLowerCase();
    return ordered.find(({ name }) => name.toLowerCase().startsWith(text))?.id;
}
