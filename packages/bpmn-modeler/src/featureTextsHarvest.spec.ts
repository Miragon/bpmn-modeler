import { describe, expect, it } from "vitest";

import { APPEND_MENU_KEYS } from "@miragon/bpmn-modeler-append-menu";
import { DEFINITION_SEARCH_KEYS } from "@miragon/bpmn-modeler-definition-search";
import { ID_FROM_NAME_KEYS } from "@miragon/bpmn-modeler-element-ids";
import { CHOOSER_KEYS } from "@miragon/bpmn-modeler-element-template-chooser";
import {
    harvestNote,
    harvestRecord,
    harvestRecordPath,
    type HarvestFile,
} from "@miragon/bpmn-modeler-i18n-extras/testing";
import { MODEL_NAVIGATION_KEYS } from "@miragon/bpmn-model-navigation";
import { ENGINES, SURFACE_MODES, type DetectedEngine } from "@miragon/bpmn-modeler-types";

import {
    C7_POPUP_MENU_ANNOTATIONS,
    C8_POPUP_MENU_ANNOTATIONS,
} from "./engines/domain/popupMenuAnnotationOverrides";
import { mountModeStrip } from "./modeSession/adapter/in/modeStrip";
import { BASE_POPUP_MENU_ANNOTATIONS } from "./popupMenuAnnotations/domain/baseAnnotations";

// The overlay keeps these texts because this record names them; the browser drivers open none of these features.
const FEATURE_HARVEST_FILE: HarvestFile = "harvested-modeler-features.json";
const FEATURE_HARVEST_SUBJECT =
    "Templates the modeler package's own features pass to translate() where no browser driver reaches them (the mode strip, the popup-menu annotations of every surface, the element template chooser, the append menu, the ID-from-name links, the definition search and the linked form's context pad entry)";

const DETECTED_ENGINES: readonly DetectedEngine[] = [...ENGINES, undefined];

function modeStripKeys(): string[] {
    const keys: string[] = [];
    const strip = mountModeStrip({
        stripEl: document.createElement("div"),
        translate: (template) => {
            keys.push(template);
            return template;
        },
        onLabelChange: () => undefined,
        onSelect: () => undefined,
    });
    for (const mode of SURFACE_MODES) {
        for (const engine of DETECTED_ENGINES) {
            strip.render({ mode, engine, busy: false });
        }
    }
    strip.destroy();
    return keys;
}

function popupMenuAnnotationKeys(): string[] {
    return [{}, C7_POPUP_MENU_ANNOTATIONS, C8_POPUP_MENU_ANNOTATIONS].flatMap((overrides) =>
        BASE_POPUP_MENU_ANNOTATIONS.withOverrides(overrides).translatableTexts(),
    );
}

describe("the modeler features' harvest", () => {
    it("records every key the features no browser driver reaches pass to translate", async ({
        task,
    }) => {
        const keys = [
            ...modeStripKeys(),
            ...popupMenuAnnotationKeys(),
            ...CHOOSER_KEYS,
            ...APPEND_MENU_KEYS,
            ...ID_FROM_NAME_KEYS,
            ...DEFINITION_SEARCH_KEYS,
            ...MODEL_NAVIGATION_KEYS,
        ];

        await expect(
            harvestRecord(harvestNote(FEATURE_HARVEST_SUBJECT, task), keys),
        ).toMatchFileSnapshot(harvestRecordPath(FEATURE_HARVEST_FILE));
    });
});
