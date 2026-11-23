import { describe, expect, it } from "vitest";

import { orderMembers } from "./memberOrder";

describe("orderMembers", () => {
    it.each([
        {
            rule: "keeps current's order",
            current: ["A", "B", "C"],
            incoming: ["C", "B", "A"],
            members: ["A", "B", "C"],
            expected: ["A", "B", "C"],
        },
        {
            rule: "leaves out what is not a member",
            current: ["A", "B", "C"],
            incoming: ["A", "C"],
            members: ["A", "C"],
            expected: ["A", "C"],
        },
        {
            rule: "inserts an incoming element after the sibling it follows in incoming",
            current: ["A", "B", "C"],
            incoming: ["A", "B", "N", "C"],
            members: ["A", "B", "C", "N"],
            expected: ["A", "B", "N", "C"],
        },
        {
            rule: "keeps a run of incoming elements together",
            current: ["A", "B"],
            incoming: ["A", "N1", "N2", "N3", "B"],
            members: ["A", "B", "N1", "N2", "N3"],
            expected: ["A", "N1", "N2", "N3", "B"],
        },
        {
            rule: "skips predecessors that are not members",
            current: ["A", "B"],
            incoming: ["A", "Gone", "N", "B"],
            members: ["A", "B", "N"],
            expected: ["A", "N", "B"],
        },
        {
            rule: "puts an incoming element without a placed predecessor first",
            current: ["A", "B"],
            incoming: ["N", "A", "B"],
            members: ["A", "B", "N"],
            expected: ["N", "A", "B"],
        },
        {
            rule: "appends members neither order lists",
            current: ["A"],
            incoming: ["A"],
            members: ["A", "Stray"],
            expected: ["A", "Stray"],
        },
    ])("$rule", ({ current, incoming, members, expected }) => {
        expect(orderMembers(current, incoming, new Set(members))).toEqual(expected);
    });

    it("orders object keys by identity", () => {
        const first = { name: "first" };
        const second = { name: "second" };
        expect(orderMembers([second, first], [], new Set([first, second]))).toEqual([
            second,
            first,
        ]);
    });
});
