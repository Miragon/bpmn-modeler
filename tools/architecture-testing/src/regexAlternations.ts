const GROUP_PREFIX = /^\?(?::|=|!|<=|<!|<[A-Za-z_$][\w$]*>)/;
// A word character or a class of them, each optionally followed by ?: nothing else spells few words.
const SPELLED_ATOM = /(?:\[(\w+)\]|([\w-]))(\?)?/y;
const MAX_SPELLED_VALUES = 64;

/** The pattern itself and each group's body, in the order they open; escapes and classes hold no group. */
function alternationBodies(pattern: string): string[] {
    const bodies: { readonly start: number; readonly body: string }[] = [
        { start: -1, body: pattern },
    ];
    const openGroups: number[] = [];
    let inClass = false;
    for (let index = 0; index < pattern.length; index++) {
        const character = pattern[index];
        if (character === "\\") {
            index++;
        } else if (inClass) {
            inClass = character !== "]";
        } else if (character === "[") {
            inClass = true;
        } else if (character === "(") {
            openGroups.push(index);
        } else if (character === ")") {
            const start = openGroups.pop();
            if (start !== undefined) {
                const body = pattern.slice(start + 1, index).replace(GROUP_PREFIX, "");
                bodies.push({ start, body });
            }
        }
    }
    return bodies.sort((left, right) => left.start - right.start).map(({ body }) => body);
}

function spelledValues(alternative: string): string[] | undefined {
    let values = [""];
    SPELLED_ATOM.lastIndex = 0;
    while (SPELLED_ATOM.lastIndex < alternative.length) {
        const atom = SPELLED_ATOM.exec(alternative);
        if (atom === null) {
            return undefined;
        }
        const [, characterClass, character, optional] = atom;
        const choices = [...(optional ? [""] : []), ...(characterClass ?? character)];
        values = values.flatMap((prefix) => choices.map((choice) => prefix + choice));
        if (values.length > MAX_SPELLED_VALUES) {
            return undefined;
        }
    }
    return values.includes("") ? undefined : values;
}

function alternationValues(body: string): string[] | undefined {
    const alternatives = body.split("|");
    if (alternatives.length < 2) {
        return undefined;
    }
    const spelled = alternatives.map(spelledValues);
    if (!spelled.every((values): values is string[] => values !== undefined)) {
        return undefined;
    }
    const values = spelled.flat();
    return values.length > MAX_SPELLED_VALUES ? undefined : values;
}

/**
 * The value sets a regular expression pattern spells as an alternation of words, its own and each
 * group's. A bar inside a nested group, an escape or a class is no word character, so splitting a
 * body on every bar rejects such an alternation instead of misreading it.
 */
export function readAlternationValues(pattern: string): string[][] {
    return alternationBodies(pattern).flatMap((body) => {
        const values = alternationValues(body);
        return values === undefined ? [] : [values];
    });
}
