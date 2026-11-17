import { describe, expect, it } from "vitest";

import { ConflictMarkerReading, readConflictMarkers } from "./conflictMarkers";

const lines = (...rows: string[]): string => rows.join("\n");

describe("readConflictMarkers", () => {
    it.each<[string, string, ConflictMarkerReading]>([
        [
            "a merge conflict with both labels",
            lines(
                "<bpmn:definitions>",
                "<<<<<<< HEAD",
                '  <bpmn:task id="Task_Check" name="Check current order" />',
                "=======",
                '  <bpmn:task id="Task_Check" name="Check incoming order" />',
                ">>>>>>> feature",
                "</bpmn:definitions>",
            ),
            { hasMarkers: true, currentLabel: "HEAD", incomingLabel: "feature" },
        ],
        [
            "a diff3 conflict with the ancestor between the sides",
            lines(
                "<<<<<<< HEAD",
                "current",
                "||||||| base",
                "ancestor",
                "=======",
                "incoming",
                ">>>>>>> 9f8e7d6 (Rename the check)",
            ),
            { hasMarkers: true, currentLabel: "HEAD", incomingLabel: "9f8e7d6 (Rename the check)" },
        ],
        [
            "the labels of a stash pop",
            lines("<<<<<<< Updated upstream", "a", "=======", "b", ">>>>>>> Stashed changes"),
            {
                hasMarkers: true,
                currentLabel: "Updated upstream",
                incomingLabel: "Stashed changes",
            },
        ],
        [
            "markers without labels",
            lines("<<<<<<<", "a", "=======", "b", ">>>>>>>"),
            { hasMarkers: true, currentLabel: undefined, incomingLabel: undefined },
        ],
        [
            "markers in a file with Windows line endings",
            "<<<<<<< HEAD\r\na\r\n=======\r\nb\r\n>>>>>>> feature\r\n",
            { hasMarkers: true, currentLabel: "HEAD", incomingLabel: "feature" },
        ],
        [
            "a script body that holds the marker text inside a line",
            lines(
                "<bpmn:script>",
                "  var arrow = '<<<<<<< not a marker';",
                "  var other = '>>>>>>> nor this';",
                "</bpmn:script>",
            ),
            { hasMarkers: false },
        ],
        [
            "an opening marker without a closing one",
            lines("<<<<<<< HEAD", "a", "=======", "b"),
            { hasMarkers: false },
        ],
        [
            "a closing marker before the opening one",
            lines(">>>>>>> feature", "=======", "<<<<<<< HEAD"),
            { hasMarkers: false },
        ],
        [
            "a separator and a closing marker without an opening one",
            lines("=======", ">>>>>>> feature"),
            { hasMarkers: false },
        ],
        [
            "a separator only before the opening marker",
            lines("=======", "<<<<<<< HEAD", "a", ">>>>>>> feature"),
            { hasMarkers: false },
        ],
        [
            "a closing marker only before the separator",
            lines("<<<<<<< HEAD", ">>>>>>> feature", "=======", "b"),
            { hasMarkers: false },
        ],
        [
            "a longer run of the marker characters",
            lines("<<<<<<<< HEAD", "a", "========", "b", ">>>>>>>> feature"),
            { hasMarkers: false },
        ],
        [
            "plain BPMN",
            lines('<bpmn:definitions id="Definitions_1">', "</bpmn:definitions>"),
            { hasMarkers: false },
        ],
        ["an empty file", "", { hasMarkers: false }],
    ])("%s", (_case, text, expected) => {
        expect(readConflictMarkers(text)).toStrictEqual(expected);
    });
});
