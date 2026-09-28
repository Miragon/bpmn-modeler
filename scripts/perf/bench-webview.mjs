#!/usr/bin/env node
// Wall-clock benchmark of the production bpmn-webview bundle on generated large models.
// Manual only (not CI-gated): numbers depend on the machine. See
// docs/vscode/contributing/development.md ("Performance harness").
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { cpus } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { chromium } from "playwright";

import { generateLargeC7Model, largeModelPresets } from "./largeBpmnModel.mjs";

const repoRoot = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
const webviewDist = resolve(repoRoot, "dist/webview-staging/bpmn-webview");

// Longer than the longest lint deferral (5 s quiet period + 1 s idle timeout), so a
// debounced pass after the last edit is measured rather than cut off.
const QUIET_WINDOW_MS = 7000;
const SETTLE_TIMEOUT_MS = 120_000;
const EDIT_DRAGS = 5;
// Fit-to-viewport renders 2k+ models too small to hit an element without landing on a neighbour.
const MIN_DRAGGABLE_WIDTH_PX = 30;
const DRAG_DISTANCE_PX = 8;

const { values: options } = parseArgs({
    options: {
        sizes: { type: "string", default: "500,2000,5000" },
        locales: { type: "string", default: "en,de" },
        lint: { type: "string", default: "off,in-page" },
        runs: { type: "string", default: "5" },
        warmup: { type: "string", default: "1" },
        json: { type: "string" },
        headed: { type: "boolean", default: false },
    },
});

const sizes = options.sizes.split(",").map(Number);
const locales = options.locales.split(",");
const lintModes = options.lint.split(",");
const runsPerCell = Number(options.runs);
const warmupRuns = Number(options.warmup);

for (const size of sizes) {
    if (!largeModelPresets[size]) {
        fail(`Unknown size ${size}; available: ${Object.keys(largeModelPresets).join(", ")}`);
    }
}
for (const lintMode of lintModes) {
    if (!["off", "in-page"].includes(lintMode)) {
        fail(`Unknown lint mode ${lintMode}; available: off, in-page`);
    }
}
if (!existsSync(join(webviewDist, "index.js"))) {
    fail(
        "No production webview build found. Run:\n" +
            "  corepack yarn build:libs && corepack yarn build:bpmn-webview",
    );
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

// Serialized into the page by Playwright, so it must stay self-contained.
function installHostShim({ lintMode, locale }) {
    const modelXml = fetch("/model.bpmn").then((response) => response.text());
    const reply = (message) => globalThis.postMessage(message, "*");
    const replyWithModelFile = async () =>
        reply({
            type: "BpmnFileQuery",
            content: await modelXml,
            engine: "c7",
            documentRevision: 0,
        });

    const harness = { longTasks: [], ignoredMessageTypes: [] };
    globalThis.__perfHarness = harness;

    let webviewState;
    globalThis.acquireVsCodeApi = () => ({
        postMessage(message) {
            switch (message.type) {
                case "GetBpmnFileCommand":
                    replyWithModelFile();
                    break;
                case "GetElementTemplatesCommand":
                    reply({ type: "ElementTemplatesQuery", elementTemplates: [] });
                    break;
                case "GetBpmnlintConfigCommand":
                    reply(
                        lintMode === "in-page"
                            ? { type: "BpmnlintInPageQuery" }
                            : { type: "BpmnLintDisabledQuery" },
                    );
                    break;
                // Same order as the real host: settings first, then the locale.
                case "GetBpmnModelerSettingCommand":
                    reply({
                        type: "BpmnModelerSettingQuery",
                        setting: {
                            alignToOrigin: false,
                            showTransactionBoundaries: true,
                            colorTheme: "light",
                        },
                    });
                    reply({ type: "LanguageQuery", locale });
                    break;
                case "GetPropertiesPanelStateCommand":
                    reply({ type: "PropertiesPanelStateQuery", visible: true });
                    break;
                default:
                    if (!harness.ignoredMessageTypes.includes(message.type)) {
                        harness.ignoredMessageTypes.push(message.type);
                    }
            }
        },
        getState: () => webviewState,
        setState: (nextState) => {
            webviewState = nextState;
        },
    });

    new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
            harness.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
        }
    }).observe({ type: "longtask", buffered: true });
}

const SHELL_HTML = `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <link href="/index.css" rel="stylesheet"/>
        <title>BPMN Modeler perf harness</title>
    </head>
    <body>
        <div class="content with-diagram" id="js-drop-zone">
            <div class="canvas" id="js-canvas"></div>
            <div id="js-panel-resizer" class="panel-resizer"></div>
            <div class="properties-panel-parent" id="js-properties-panel"></div>
        </div>
        <script type="module" src="/index.js"></script>
    </body>
</html>`;

const CONTENT_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".ttf": "font/ttf",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
};

function startServer() {
    let currentModelXml = "";
    const server = createServer((request, response) => {
        const path = decodeURIComponent((request.url ?? "/").split(/[?#]/)[0]);
        if (path === "/") {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end(SHELL_HTML);
            return;
        }
        if (path === "/model.bpmn") {
            response.writeHead(200, { "content-type": "application/xml; charset=utf-8" });
            response.end(currentModelXml);
            return;
        }
        const filePath = normalize(join(webviewDist, path));
        if (!filePath.startsWith(webviewDist) || !existsSync(filePath)) {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, {
            "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
        });
        response.end(readFileSync(filePath));
    });
    return new Promise((resolveServer) => {
        server.listen(0, "127.0.0.1", () => {
            resolveServer({
                origin: `http://127.0.0.1:${server.address().port}`,
                setModelXml: (xml) => {
                    currentModelXml = xml;
                },
                close: () => server.close(),
            });
        });
    });
}

async function readHarness(page) {
    return page.evaluate(() => ({
        now: performance.now(),
        longTasks: globalThis.__perfHarness.longTasks,
        ignoredMessageTypes: globalThis.__perfHarness.ignoredMessageTypes,
    }));
}

async function waitForQuietMainThread(page, sinceMs) {
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    let quietSinceLongTaskEnd;
    for (;;) {
        const harness = await readHarness(page);
        const lastLongTaskEnd = Math.max(
            sinceMs,
            ...harness.longTasks.map((task) => task.startTime + task.duration),
        );
        // A poll queued behind a long task runs before the observer reports that task.
        if (harness.now - lastLongTaskEnd < QUIET_WINDOW_MS) {
            quietSinceLongTaskEnd = undefined;
        } else if (quietSinceLongTaskEnd === lastLongTaskEnd) {
            return harness;
        } else {
            quietSinceLongTaskEnd = lastLongTaskEnd;
        }
        if (Date.now() > deadline) {
            throw new Error("Main thread never went quiet");
        }
        await page.waitForTimeout(250);
    }
}

function summarizeLongTasks(longTasks, sinceMs) {
    const relevantTasks = longTasks.filter((task) => task.startTime >= sinceMs);
    return {
        busyUntilMs: Math.max(
            0,
            ...relevantTasks.map((task) => task.startTime + task.duration - sinceMs),
        ),
        longestTaskMs: Math.max(0, ...relevantTasks.map((task) => task.duration)),
    };
}

async function zoomUntilDraggable(page, elementId) {
    const element = page.locator(`.djs-element[data-element-id="${elementId}"]`);
    for (let attempt = 0; attempt < 50; attempt++) {
        const box = await element.boundingBox();
        if (!box) break;
        if (box.width >= MIN_DRAGGABLE_WIDTH_PX) return;
        // Lint badges on the element swallow wheel events, so zoom around the empty row gap above it.
        await page.mouse.move(box.x + box.width / 2, box.y - box.height);
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, -300);
        await page.keyboard.up("Control");
        await page.waitForTimeout(50);
    }
    throw new Error(`Could not zoom ${elementId} to a draggable size`);
}

async function dragEditableElements(page, elementIds) {
    let movedElements = 0;
    for (const elementId of elementIds) {
        const element = page.locator(`.djs-element[data-element-id="${elementId}"]`);
        const transformBefore = await element.getAttribute("transform");
        const box = await element.boundingBox();
        if (!box) continue;
        const centerX = box.x + box.width / 2;
        const centerY = box.y + box.height / 2;
        await page.mouse.move(centerX, centerY);
        await page.mouse.down();
        await page.mouse.move(centerX, centerY + DRAG_DISTANCE_PX, { steps: 4 });
        await page.mouse.up();
        if ((await element.getAttribute("transform")) !== transformBefore) movedElements++;
    }
    return movedElements;
}

async function measureRun(browser, server, cell) {
    const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
    const page = await context.newPage();
    try {
        await page.addInitScript(installHostShim, {
            lintMode: cell.lintMode,
            locale: cell.locale,
        });
        await page.goto(server.origin);
        try {
            await page.waitForSelector('#js-properties-panel[aria-busy="false"]', {
                state: "attached",
                timeout: SETTLE_TIMEOUT_MS,
            });
        } catch (error) {
            const harness = await readHarness(page);
            throw new Error(
                `Webview never cleared busy; unanswered host messages: ${harness.ignoredMessageTypes.join(", ") || "none"}`,
                { cause: error },
            );
        }
        const openHarness = await waitForQuietMainThread(page, 0);
        const open = summarizeLongTasks(openHarness.longTasks, 0);

        const dragTargets = cell.model.editableElementIds.slice(0, EDIT_DRAGS);
        await zoomUntilDraggable(page, dragTargets[0]);
        const zoomHarness = await waitForQuietMainThread(page, openHarness.now);

        const editStart = zoomHarness.now;
        const movedElements = await dragEditableElements(page, dragTargets);
        const editHarness = await waitForQuietMainThread(page, editStart);
        const edit = summarizeLongTasks(editHarness.longTasks, editStart);

        return { open, edit, movedElements };
    } finally {
        await context.close();
    }
}

function median(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function formatSeconds(milliseconds) {
    return (milliseconds / 1000).toFixed(2);
}

function formatSamples(samples) {
    return `${formatSeconds(median(samples))} s (${formatSeconds(Math.min(...samples))}–${formatSeconds(Math.max(...samples))})`;
}

function currentCommit() {
    try {
        return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: repoRoot })
            .toString()
            .trim();
    } catch {
        return "unknown";
    }
}

const server = await startServer();
const browser = await chromium.launch({ headless: !options.headed });
const environment = {
    commit: currentCommit(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
    chromium: browser.version(),
    runsPerCell,
};
const results = [];
let warmedUp = false;

try {
    for (const size of sizes) {
        const model = generateLargeC7Model(largeModelPresets[size]);
        server.setModelXml(model.xml);
        for (const lintMode of lintModes) {
            for (const locale of locales) {
                const cell = { size, lintMode, locale, model };
                const label = `${size} nodes / lint ${lintMode} / ${locale}`;
                for (let warmup = 0; !warmedUp && warmup < warmupRuns; warmup++) {
                    process.stderr.write(`warm-up ${label}\n`);
                    await measureRun(browser, server, cell);
                }
                warmedUp = true;
                const samples = [];
                for (let run = 1; run <= runsPerCell; run++) {
                    process.stderr.write(`run ${run}/${runsPerCell} ${label}\n`);
                    const sample = await measureRun(browser, server, cell);
                    if (sample.movedElements !== EDIT_DRAGS) {
                        process.stderr.write(
                            `  warning: only ${sample.movedElements}/${EDIT_DRAGS} drags moved an element\n`,
                        );
                    }
                    samples.push(sample);
                }
                results.push({
                    size,
                    xmlBytes: Buffer.byteLength(model.xml),
                    lintMode,
                    locale,
                    samples,
                });
            }
        }
    }
} finally {
    await browser.close();
    server.close();
}

console.log(
    `Commit ${environment.commit} · ${environment.cpu} · Node ${environment.node} · Chromium ${environment.chromium} · median (min–max) of ${runsPerCell} runs\n`,
);
console.log(
    "| Model | Lint | Locale | Open: busy until | Open: longest task | Edit burst: busy until | Edit burst: longest task |",
);
console.log("|---|---|---|---|---|---|---|");
for (const result of results) {
    const pick = (phase, metric) => result.samples.map((sample) => sample[phase][metric]);
    console.log(
        `| ${result.size} nodes / ${(result.xmlBytes / 1e6).toFixed(2)} MB | ${result.lintMode} | ${result.locale} | ` +
            `${formatSamples(pick("open", "busyUntilMs"))} | ${formatSamples(pick("open", "longestTaskMs"))} | ` +
            `${formatSamples(pick("edit", "busyUntilMs"))} | ${formatSamples(pick("edit", "longestTaskMs"))} |`,
    );
}

if (options.json) {
    writeFileSync(options.json, JSON.stringify({ environment, results }, null, 2));
}
