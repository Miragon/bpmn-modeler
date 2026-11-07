import { describe, expect, it } from "vitest";

import { missedPartnerFindings } from "./missedPartnerFindings";
import type { MissedPartner } from "./missedPartners";

const A = "libs/core/src/a.ts";
const B = "libs/core/src/b.ts";
const C = "libs/core/src/c.ts";

function pair(overrides: Partial<MissedPartner>): MissedPartner {
    return {
        file: A,
        partner: B,
        sharedChanges: 6,
        fileRevisions: 7,
        partnerRevisions: 6,
        countedChangesets: 29,
        ...overrides,
    };
}

describe("missed partner findings", () => {
    it("names the file, its partner, the shared changes and the lift", () => {
        expect(missedPartnerFindings([pair({})])).toEqual([
            {
                key: `${A} → ${B}`,
                path: A,
                paths: [A, B],
                line: 1,
                message: `\`${A}\` changed; in 6 of 7 changes to \`${A}\`, \`${B}\` changed too (lift 4.1)`,
                rank: 1,
            },
        ]);
    });

    it.each([
        {
            case: "the higher confidence first",
            pairs: [pair({ partner: B }), pair({ partner: C, sharedChanges: 7 })],
            expected: [C, B],
        },
        {
            case: "the higher lift first at equal confidence",
            pairs: [pair({ partner: B }), pair({ partner: C, countedChangesets: 90 })],
            expected: [C, B],
        },
        {
            case: "by partner at equal confidence and lift",
            pairs: [pair({ partner: C }), pair({ partner: B })],
            expected: [B, C],
        },
    ])("ranks $case", ({ pairs, expected }) => {
        const ranked = missedPartnerFindings(pairs)
            .sort((left, right) => (left.rank as number) - (right.rank as number))
            .map(({ key }) => key.split(" → ")[1]);

        expect(ranked).toEqual(expected);
    });
});
