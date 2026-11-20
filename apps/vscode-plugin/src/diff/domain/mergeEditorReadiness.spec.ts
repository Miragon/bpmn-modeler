import { describe, expect, it } from "vitest";

import { mergeEditorIsReady } from "./mergeEditorReadiness";

const MARKERS = "<<<<<<< main\nmain\n=======\nfeature\n>>>>>>> feature\n";

describe("mergeEditorIsReady", () => {
    it.each<[string, string, readonly { isDirty: boolean }[], boolean]>([
        ["no tab shows the merge yet", MARKERS, [], false],
        ["the editor still loads a start with markers", MARKERS, [{ isDirty: false }], false],
        ["the editor merged a start with markers", MARKERS, [{ isDirty: true }], true],
        [
            "one of two tabs reports the merged start",
            MARKERS,
            [{ isDirty: false }, { isDirty: true }],
            true,
        ],
        ["the tab of a start without markers shows", "<bpmn:task />\n", [{ isDirty: false }], true],
        ["no tab shows a start without markers yet", "<bpmn:task />\n", [], false],
        [
            "an opening marker on a later line, with CRLF endings",
            "<bpmn:task />\r\n<<<<<<< main\r\n",
            [{ isDirty: false }],
            false,
        ],
        [
            "an opening marker on a later line, with CR endings",
            "<bpmn:task />\r<<<<<<< main\r",
            [{ isDirty: false }],
            false,
        ],
        [
            "a lone opening marker, which VS Code also merges",
            "<<<<<<<\n<bpmn:task />\n",
            [{ isDirty: false }],
            false,
        ],
        [
            "an opening marker that does not start its line",
            " <<<<<<< main\n<bpmn:task />\n",
            [{ isDirty: false }],
            true,
        ],
    ])("%s", (_case, start, shownTabs, ready) => {
        expect(mergeEditorIsReady({ start, onWorkingCopy: false }, shownTabs)).toBe(ready);
    });

    it.each<[string, readonly { isDirty: boolean }[], boolean]>([
        ["no tab shows the merge yet", [], false],
        ["the tab shows, clean, since the editor merges into its copy", [{ isDirty: false }], true],
    ])("on a working copy, a start with markers: %s", (_case, shownTabs, ready) => {
        expect(mergeEditorIsReady({ start: MARKERS, onWorkingCopy: true }, shownTabs)).toBe(ready);
    });
});
