/** What Git's conflict markers in a file say: whether it holds them, and the labels of both sides. */
export type ConflictMarkerReading =
    | { readonly hasMarkers: false }
    | {
          readonly hasMarkers: true;
          readonly currentLabel: string | undefined;
          readonly incomingLabel: string | undefined;
      };

const OPENING = "<<<<<<<";
const SEPARATOR = "=======";
const CLOSING = ">>>>>>>";

/**
 * Reads the first conflict Git wrote into a file: a line starting with
 * `<<<<<<<`, a later `=======` (a diff3 `|||||||` block may sit between) and a
 * later `>>>>>>>`, each at the start of its line. The text after a marker is
 * its side's label. The one marker grammar of the core and the merge: a
 * lone marker line, such as a Markdown underline of seven `=`, is no conflict.
 */
export function readConflictMarkers(text: string): ConflictMarkerReading {
    const lines = text.split(/\r?\n/);
    const opening = lines.findIndex((line) => isMarker(line, OPENING));
    if (opening < 0) {
        return { hasMarkers: false };
    }
    const separator = lines.findIndex(
        (line, index) => index > opening && isMarker(line, SEPARATOR),
    );
    const closing = lines.findIndex((line, index) => index > separator && isMarker(line, CLOSING));
    if (separator < 0 || closing < 0) {
        return { hasMarkers: false };
    }
    return {
        hasMarkers: true,
        currentLabel: labelOf(lines[opening]),
        incomingLabel: labelOf(lines[closing]),
    };
}

function isMarker(line: string, marker: string): boolean {
    return (
        line.startsWith(marker) && (line.length === marker.length || line[marker.length] === " ")
    );
}

function labelOf(markerLine: string): string | undefined {
    const label = markerLine.slice(OPENING.length).trim();
    return label === "" ? undefined : label;
}
