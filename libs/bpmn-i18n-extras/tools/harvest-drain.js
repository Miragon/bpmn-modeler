/*
 * Browser-side harvest driver. Paste into the bpmn-webview dev page console
 * (yarn workspace @miragon/bpmn-modeler-webview serve) — or run via Playwright
 * `browser_evaluate` — after the modeler has loaded. It relies on the dev-only
 * recorder wired in apps/bpmn-webview/src/main.ts, which exposes
 * `window.__injector` (the modeler's DI container) and `window.__harvested`
 * (the Set of every template passed to translate()).
 *
 * It exercises the surfaces bpmn-js builds at runtime (palette, context pad,
 * replace/append/create menus, linting) and then walks the properties panel for
 * a broad set of Camunda-7 elements and implementation configs, expanding every
 * group so the panel actually renders — properties-panel labels are translated
 * during React render, not at getGroups() time.
 *
 * When it settles, copy `JSON.stringify([...window.__harvested].sort())` into
 * tools/harvested.json (under the {note,count,keys} wrapper) and run
 * tools/build-overlay.mjs --write. See tools/README.md.
 *
 * Coverage is deliberately broad but not proven-exhaustive; build-overlay only
 * drops keys whose modern form was actually harvested, so gaps here shrink the
 * pruning, never cause a regression.
 */
/* global window, document, setTimeout */
window.__harvestDrain = async function harvestDrain() {
    const inj = window.__injector;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const er = inj.get("elementRegistry");
    const modeling = inj.get("modeling");
    const moddle = inj.get("moddle");
    const bpmnFactory = inj.get("bpmnFactory");
    const selection = inj.get("selection");
    const root = inj.get("canvas").getRootElement();
    const guard = (fn) => {
        try {
            return fn();
        } catch {
            /* keep draining */
        }
    };

    // Create a broad element set so the panel surfaces every C7 provider group.
    let x = 200;
    const mk = (type) =>
        guard(() => {
            const bo = bpmnFactory.create(type, {});
            const shape = inj.get("elementFactory").createShape({ type, businessObject: bo });
            return modeling.createShape(shape, { x: (x += 130), y: 500 }, root);
        });
    [
        "bpmn:UserTask",
        "bpmn:SendTask",
        "bpmn:ReceiveTask",
        "bpmn:ScriptTask",
        "bpmn:BusinessRuleTask",
        "bpmn:ManualTask",
        "bpmn:SubProcess",
        "bpmn:CallActivity",
        "bpmn:ExclusiveGateway",
        "bpmn:ParallelGateway",
        "bpmn:InclusiveGateway",
        "bpmn:EventBasedGateway",
        "bpmn:ComplexGateway",
        "bpmn:IntermediateThrowEvent",
        "bpmn:IntermediateCatchEvent",
        "bpmn:DataObjectReference",
        "bpmn:DataStoreReference",
        "bpmn:Group",
        "bpmn:TextAnnotation",
    ].forEach(mk);

    // Configure one service task through every implementation type + async +
    // extensions so their conditional groups render.
    const st = er.getAll().find((e) => e.type === "bpmn:ServiceTask");
    const setProps = (el, props) => guard(() => modeling.updateProperties(el, props));
    if (st) {
        setProps(st, { "camunda:asyncBefore": true, "camunda:asyncAfter": true });
        for (const impl of [
            { "camunda:class": "com.acme.Foo" },
            { "camunda:class": undefined, "camunda:delegateExpression": "${bean}" },
            {
                "camunda:delegateExpression": undefined,
                "camunda:expression": "${e}",
                "camunda:resultVariable": "r",
            },
            { "camunda:expression": undefined, "camunda:type": "external", "camunda:topic": "t" },
        ]) {
            setProps(st, impl);
            await sleep(60);
        }
        guard(() => {
            const ext = bpmnFactory.create("bpmn:ExtensionElements", {
                values: [
                    moddle.create("camunda:Connector", { connectorId: "http" }),
                    moddle.create("camunda:ExecutionListener", { event: "start", class: "C" }),
                    moddle.create("camunda:Field", { name: "x", string: "y" }),
                ],
            });
            modeling.updateProperties(st, { extensionElements: ext });
        });
    }

    await sleep(200);
    // Select every element and expand all groups so labels render.
    for (const el of er.getAll().filter((e) => e !== root && e.type !== "label")) {
        guard(() => selection.select(el));
        await sleep(90);
        for (let pass = 0; pass < 10; pass++) {
            const headers = [...document.querySelectorAll(".bio-properties-panel-group-header")];
            let clicked = 0;
            for (const h of headers) {
                const entries = h.parentElement?.querySelector(
                    ".bio-properties-panel-group-entries",
                );
                if (entries && !entries.classList.contains("open")) {
                    h.click();
                    clicked++;
                }
            }
            await sleep(45);
            if (!clicked) break;
        }
        for (const li of document.querySelectorAll(
            ".bio-properties-panel-collapsible-entry-header",
        )) {
            guard(() => li.click());
        }
    }
    return window.__harvested.size;
};
