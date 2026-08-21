/**
 * GUARD-I18N-EXTRAS-MINIMAL
 *
 * The overlay must carry only keys the shared `@miragon/bpmn-modeler-i18n`
 * library does not ship — in *no* spelling. Two ways it can rot:
 *
 *  - Exact collision: the shared library gains a key the overlay still defines.
 *    The local copy is then dead weight that also shadows the (authoritative)
 *    shared translation via `extend()`'s consumer-wins merge.
 *  - Normalized collision: the overlay carries a legacy casing/spacing variant
 *    of a shared key (`Business Key` vs shared `Business key`). The modeler
 *    emits the modern form the shared library already covers, so the override is
 *    never requested — dead. This is what the runtime harvest removed; the guard
 *    keeps it from creeping back.
 *
 * Either way the failure names the keys to delete from `src/languages/*`,
 * turning "shrink the overlay as the shared library catches up" into a
 * mechanical, enforced step.
 */
import { describe, expect, it } from "vitest";

import { dictionaries } from "@miragon/bpmn-modeler-i18n";

import { extras } from "./languages";

// Mirrors tools/build-overlay.mjs and the plugin repo's drift tooling.
const norm = (value: string): string =>
    value
        .toLowerCase()
        .replace(/\bthe\b/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/[.\s]+$/, "");

describe("i18n extras stay minimal against the shared library", () => {
    const overlayKeys = Object.keys(extras.en ?? {});

    it("defines no key the shared library already ships (exact)", () => {
        const sharedEnKeys = new Set(Object.keys(dictionaries.en));
        const nowCovered = overlayKeys.filter((key) => sharedEnKeys.has(key));

        expect(
            nowCovered,
            "these overlay keys are now in the shared library — remove them from src/languages/*",
        ).toEqual([]);
    });

    it("defines no legacy variant of a shared key (normalized)", () => {
        const sharedByNorm = new Map(Object.keys(dictionaries.en).map((key) => [norm(key), key]));
        const superseded = overlayKeys
            .map((key) => ({ key, modern: sharedByNorm.get(norm(key)) }))
            .filter(({ key, modern }) => modern !== undefined && modern !== key);

        expect(
            superseded,
            "these overlay keys are legacy variants the shared library covers in modern form — remove them",
        ).toEqual([]);
    });
});
