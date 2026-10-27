import { escapeRegExpLiteral } from "@miragon/bpmn-modeler-core";

export interface TextPosition {
    readonly line: number;
    readonly character: number;
}

const ID_ATTRIBUTE = /\sid=["']([^"']*)["']/g;

/**
 * Text positions of `id="…"` attributes in one XML document, located with a
 * plain string scan rather than an XML parse. Built in a single pass so a lint
 * push with many findings stays linear in the XML size. A position points at
 * the whitespace before `id`, and the first occurrence of an id wins.
 */
export class ElementIdPositions {
    private readonly offsetsById = new Map<string, number>();
    private readonly lineStarts: number[];

    constructor(private readonly xml: string) {
        this.lineStarts = lineStartOffsets(xml);
        const idAttribute = new RegExp(ID_ATTRIBUTE);
        for (let match = idAttribute.exec(xml); match; match = idAttribute.exec(xml)) {
            if (!this.offsetsById.has(match[1])) {
                this.offsetsById.set(match[1], match.index);
            }
            // Resume one character later: attribute-like text can overlap
            // (` id=" id="Task"`), and every overlapping start must be seen.
            idAttribute.lastIndex = match.index + 1;
        }
    }

    positionOf(id: string): TextPosition | undefined {
        const offset = containsQuote(id)
            ? searchIdAttribute(this.xml, id)
            : this.offsetsById.get(id);
        return offset === undefined ? undefined : this.positionAt(offset);
    }

    private positionAt(offset: number): TextPosition {
        let low = 0;
        let high = this.lineStarts.length - 1;
        while (low < high) {
            const middle = Math.ceil((low + high) / 2);
            if (this.lineStarts[middle] <= offset) {
                low = middle;
            } else {
                high = middle - 1;
            }
        }
        return { line: low, character: offset - this.lineStarts[low] };
    }
}

function lineStartOffsets(text: string): number[] {
    const lineStarts = [0];
    for (let index = text.indexOf("\n"); index >= 0; index = text.indexOf("\n", index + 1)) {
        lineStarts.push(index + 1);
    }
    return lineStarts;
}

function containsQuote(value: string): boolean {
    return value.includes('"') || value.includes("'");
}

// The single-pass index cannot represent ids containing quotes; they are not
// valid XML ids, so this per-id search is not a hot path.
function searchIdAttribute(xml: string, id: string): number | undefined {
    const offset = xml.search(new RegExp(`\\sid=["']${escapeRegExpLiteral(id)}["']`));
    return offset < 0 ? undefined : offset;
}
