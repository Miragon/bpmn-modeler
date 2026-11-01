/*
 * Browser-side harvest driver for the element template editor. Run it in the
 * bpmn-webview dev server's template editor page
 * (yarn workspace @miragon/bpmn-modeler-webview serve, then /template-editor.html)
 * by pasting it into the console or through Playwright, once per page state:
 *
 *   /template-editor.html                 the C8 samples
 *   /template-editor.html?engine=c7       the C7 samples
 *   /template-editor.html?file=problems   every finding of the builder's own rules
 *   /template-editor.html?file=empty      the start form
 *   /template-editor.html?file=noschema   the engine choice
 *   /template-editor.html?file=broken     the broken-JSON messages
 *   /template-editor.html?file=notemplate a JSON file without a template
 *
 * It relies on the dev-only recorder in apps/bpmn-webview/src/templateEditor/main.ts,
 * which adds every text the page translates to `window.__harvested`. The page
 * applies its own edits without a host, so the driver can switch a property
 * through every binding and type the builder offers, which renders their
 * fields' labels.
 *
 * After each page, add `[...window.__harvested]` to tools/harvested-template-editor.json
 * (sorted, under the {note,count,keys} wrapper). See tools/README.md.
 */
/* global window, document, setTimeout, Event */
window.__harvestDrainTemplateEditor = async function harvestDrainTemplateEditor() {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const $ = (selector) => document.querySelector(selector);
    const $$ = (selector) => [...document.querySelectorAll(selector)];
    const visible = (element) => element && !element.closest("[hidden]");
    const click = async (element) => {
        element?.click();
        await sleep(60);
    };
    const type = async (field, value) => {
        if (!field) return;
        field.value = value;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        await sleep(60);
    };
    const choose = async (select, value) => {
        if (!select) return;
        select.value = value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
        await sleep(60);
    };
    const optionsOf = (select) => (select ? [...select.options].map((option) => option.value) : []);
    const button = (text) =>
        $$("button").find((candidate) => candidate.textContent.trim() === text);
    const select = (entryId) => $(`[data-entry-id="${entryId}"] select`);

    // The states without a builder lead into one.
    if (visible($(".template-editor__wizard"))) {
        await type($(".template-editor__wizard-name"), "Harvest");
        $(".template-editor__wizard").requestSubmit();
        await sleep(100);
    }
    if (visible($(".template-editor__engine-choice"))) {
        await click($('.template-editor__engine-button[data-engine="c8"]'));
    }
    if (!visible($(".etb-layout"))) {
        return window.__harvested.size;
    }
    await click($(".panel-resizer-toggle"));
    await click($(".panel-resizer-toggle"));

    const walkTabs = async () => {
        for (const tab of ["template", "groups", "properties"]) {
            await click($(`#etb-tab-${tab}`));
            await type($("#etb-search"), "no-such-setting");
            await type($("#etb-search"), "");
            for (let index = 0; index < $$(".etb-index__item").length; index++) {
                await click($$(".etb-index__item")[index]);
            }
        }
        await click($(".etb-problems__chip"));
        await click($(".etb-problems__chip"));
    };

    const choice = $(".template-editor__choice");
    for (const key of visible(choice) ? optionsOf(choice) : [undefined]) {
        if (key !== undefined) await choose(choice, key);
        await walkTabs();
    }

    // Template settings that only some templates show, and a number field's check.
    await click($("#etb-tab-template"));
    await type($('[data-entry-id="template-name"] input'), "");
    await type($('[data-entry-id="template-version"] input'), "one");
    for (const elementType of optionsOf(select("template-elementType-value"))) {
        await choose(select("template-elementType-value"), elementType);
    }
    await click($("#etb-tab-groups"));
    await click(button("Add Group"));

    // Every binding and type on one property renders every field the builder edits.
    await click($("#etb-tab-properties"));
    await click(button("Add Property"));
    const last = $$(".etb-index__item").length - 1;
    await click($$(".etb-index__item")[last]);
    const at = (key) => `property-${last}-${key}`;
    for (const binding of optionsOf(select(at("binding-type")))) {
        await choose(select(at("binding-type")), binding);
        for (const field of $$(`[data-entry-id^="${at("binding-")}"] select`)) {
            if (field === select(at("binding-type"))) continue;
            for (const value of optionsOf(field)) await choose(field, value);
        }
        for (const type of optionsOf(select(at("type")))) {
            await choose(select(at("type")), type);
            await click(button("Add Choice"));
        }
    }

    // A condition with every operator, on no property yet.
    await click(button("Add Condition"));
    const operator = $(`[data-entry-id="${at("condition")}"] select[aria-label="Operator"]`);
    for (const value of optionsOf(operator)) await choose(operator, value);
    await choose(select(at("type")), optionsOf(select(at("type")))[0]);

    return window.__harvested.size;
};
