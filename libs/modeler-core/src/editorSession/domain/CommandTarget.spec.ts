import { describe, expect, it } from "vitest";

import { CommandTarget } from "./CommandTarget";

type Step =
    | readonly ["open", string, "focused" | "background"]
    | readonly ["focus", string]
    | readonly ["close", string, readonly string[]];

function play(steps: readonly Step[]): { target: string | undefined; announced: string[] } {
    const commandTarget = new CommandTarget();
    const announced: string[] = [];
    for (const step of steps) {
        let moved: string | undefined;
        if (step[0] === "open") moved = commandTarget.open(step[1], step[2] === "focused");
        else if (step[0] === "focus") moved = commandTarget.focus(step[1]);
        else moved = commandTarget.close(step[1], step[2]);
        if (moved !== undefined) announced.push(moved);
    }
    return { target: commandTarget.editorId, announced };
}

describe("CommandTarget", () => {
    it.each<{
        scenario: string;
        steps: Step[];
        target: string | undefined;
        announced: string[];
    }>([
        {
            scenario: "takes the first editor, even one that opens in the background",
            steps: [["open", "a", "background"]],
            target: "a",
            announced: ["a"],
        },
        {
            scenario: "stays on the focused editor when another opens behind it",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "background"],
            ],
            target: "a",
            announced: ["a"],
        },
        {
            scenario:
                "stays on the editor focused last when another opens while a text editor has focus",
            steps: [
                ["open", "a", "background"],
                ["open", "b", "focused"],
                ["focus", "a"],
                ["open", "c", "background"],
            ],
            target: "a",
            announced: ["a", "b", "a"],
        },
        {
            scenario: "moves to an editor that opens focused",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "focused"],
            ],
            target: "b",
            announced: ["a", "b"],
        },
        {
            scenario: "moves to a background editor once it is focused",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "background"],
                ["focus", "b"],
            ],
            target: "b",
            announced: ["a", "b"],
        },
        {
            scenario: "announces nothing when the target is focused again",
            steps: [
                ["open", "a", "focused"],
                ["focus", "a"],
            ],
            target: "a",
            announced: ["a"],
        },
        {
            scenario: "stays when a session replaces the target in the background",
            steps: [
                ["open", "a", "focused"],
                ["open", "a", "background"],
            ],
            target: "a",
            announced: ["a"],
        },
        {
            scenario: "hands a closed target back to the editor focused before it",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "background"],
                ["open", "c", "focused"],
                ["close", "c", ["a", "b"]],
            ],
            target: "a",
            announced: ["a", "c", "a"],
        },
        {
            scenario: "skips an editor that closed after it held the target",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "focused"],
                ["open", "c", "focused"],
                ["close", "b", ["a", "c"]],
                ["close", "c", ["a"]],
            ],
            target: "a",
            announced: ["a", "b", "c", "a"],
        },
        {
            scenario:
                "hands a closed target to the newest remaining editor when none of them held it",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "background"],
                ["open", "c", "background"],
                ["close", "a", ["b", "c"]],
            ],
            target: "c",
            announced: ["a", "c"],
        },
        {
            scenario: "stays when another editor closes",
            steps: [
                ["open", "a", "focused"],
                ["open", "b", "background"],
                ["close", "b", ["a"]],
            ],
            target: "a",
            announced: ["a"],
        },
        {
            scenario: "clears without an announcement when the last editor closes",
            steps: [
                ["open", "a", "focused"],
                ["close", "a", []],
            ],
            target: undefined,
            announced: ["a"],
        },
        {
            scenario: "takes the next editor once the last one closed, even in the background",
            steps: [
                ["open", "a", "focused"],
                ["close", "a", []],
                ["open", "b", "background"],
            ],
            target: "b",
            announced: ["a", "b"],
        },
        {
            scenario: "hands a closed target on again once every editor closed",
            steps: [
                ["open", "a", "focused"],
                ["close", "a", []],
                ["open", "b", "background"],
                ["open", "c", "background"],
                ["close", "b", ["c"]],
            ],
            target: "c",
            announced: ["a", "b", "c"],
        },
    ])("$scenario", ({ steps, target, announced }) => {
        expect(play(steps)).toEqual({ target, announced });
    });
});
