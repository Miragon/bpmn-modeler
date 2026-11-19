import { describe, expectTypeOf, it } from "vitest";

import type { MergeBuildNote } from "./mergeBuildNotes";

type JsonValue =
    | string
    | number
    | boolean
    | null
    | readonly JsonValue[]
    | { readonly [key: string]: JsonValue | undefined };

describe("MergeBuildNote", () => {
    it("is plain data a protocol message can carry", () => {
        expectTypeOf<MergeBuildNote>().toExtend<JsonValue>();
    });
});
