/** Replace `oldText.slice(start, end)` with `text` to get the new text. */
export interface TextReplacement {
    start: number;
    end: number;
    text: string;
}

/**
 * The smallest single replacement that turns `oldText` into `newText`, or
 * `undefined` when they are equal. A boundary never falls inside a CRLF or a
 * surrogate pair: hosts address text by line and column, which cannot point
 * between those two characters.
 */
export function minimalReplacement(oldText: string, newText: string): TextReplacement | undefined {
    if (oldText === newText) {
        return undefined;
    }
    const shorter = Math.min(oldText.length, newText.length);

    let prefix = 0;
    while (prefix < shorter && oldText[prefix] === newText[prefix]) {
        prefix++;
    }
    while (prefix > 0 && (splitsPair(oldText, prefix) || splitsPair(newText, prefix))) {
        prefix--;
    }

    let suffix = 0;
    while (
        suffix < shorter - prefix &&
        oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
    ) {
        suffix++;
    }
    while (
        suffix > 0 &&
        (splitsPair(oldText, oldText.length - suffix) ||
            splitsPair(newText, newText.length - suffix))
    ) {
        suffix--;
    }

    return {
        start: prefix,
        end: oldText.length - suffix,
        text: newText.slice(prefix, newText.length - suffix),
    };
}

function splitsPair(text: string, index: number): boolean {
    if (text[index - 1] === "\r" && text[index] === "\n") {
        return true;
    }
    const before = text.charCodeAt(index - 1);
    const after = text.charCodeAt(index);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}
