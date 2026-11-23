import { describe, expect, it } from "vitest";

import { scenarioNamed } from "../../__fixtures__/mergeScenarios";
import { prepareMergeSources } from "../../sources/service/buildMergedSources";
import { computeMerge } from "../service/computeMerge";
import { type MergeRefusal, mergeRefusalOf } from "./mergeRefusal";
import type { MergeVersions } from "../service/mergeVersions";

const LFS_POINTER =
    "version https://git-lfs.github.com/spec/v1\noid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393\nsize 12345\n";

const { base, current, incoming } = scenarioNamed("table: unchanged");

async function refusalsOf(versions: MergeVersions) {
    const refusalOf = async (run: () => Promise<unknown>) => {
        try {
            await run();
        } catch (error) {
            return mergeRefusalOf(error);
        }
        throw new Error("the merge did not refuse");
    };
    return {
        merge: await refusalOf(() => computeMerge(versions)),
        sources: await refusalOf(() => prepareMergeSources(versions)),
    };
}

describe("mergeRefusalOf", () => {
    it.each<[string, MergeVersions, MergeRefusal]>([
        [
            "a side that is no XML, such as a Git LFS pointer",
            { base, current, incoming: LFS_POINTER },
            { kind: "unparsable", version: "incoming", detail: expect.any(String) as string },
        ],
        [
            "a version with an unresolved reference",
            {
                base: current.replace('default="Flow_No"', 'default="Flow_Gone"'),
                current,
                incoming,
            },
            {
                kind: "parsesWithWarnings",
                version: "base",
                detail: expect.stringMatching(/unresolved reference <Flow_Gone>/) as string,
            },
        ],
        [
            "sides for different engines",
            { base, current, incoming: scenarioNamed("table: every row (c8)").incoming },
            { kind: "mixedEngines", current: "c7", incoming: "c8" },
        ],
        [
            "a root element without an id",
            {
                base,
                current: current.replace(
                    "</bpmn:definitions>",
                    '<bpmn:signal name="Signal without id" /></bpmn:definitions>',
                ),
                incoming,
            },
            { kind: "elementWithoutId", version: "current", elementType: "bpmn:Signal" },
        ],
    ])(
        "names %s as a value, from the merge and the sources alike",
        async (_what, versions, refusal) => {
            const { merge, sources } = await refusalsOf(versions);

            expect(merge).toStrictEqual(refusal);
            expect(sources).toStrictEqual(refusal);
        },
    );

    it("keeps the English reason for a developer and the parser's error as its cause", async () => {
        const error: unknown = await computeMerge({ base, current, incoming: LFS_POINTER }).catch(
            (caught: unknown) => caught,
        );

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toMatch(/^incoming does not parse: /);
        expect((error as { cause?: unknown }).cause).toBeInstanceOf(Error);
    });

    it("finds no refusal in any other error", () => {
        expect(mergeRefusalOf(new Error("The merge result has no element Task_1"))).toBeUndefined();
        expect(mergeRefusalOf("unparsable")).toBeUndefined();
    });
});
