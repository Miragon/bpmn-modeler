// Makes the images of the plugin's page in Orca's plugin directory, into images/:
//   cover.webp                 the branded image, 1600×1000
//   screenshot-<feature>.webp  properties, simulation, linting and dmn, each in a whole Orca window
// The shots come from a fresh Orca in the Orca smoke container (shoot.mjs), so they hold no data of
// this machine. --skip-shots reuses the PNGs of the last run.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../..");
const repository = resolve(app, "../..");
const shots = join(app, "test-results/orca-smoke/listing-images");
const images = join(app, "images");
const { values } = parseArgs({ options: { "skip-shots": { type: "boolean", default: false } } });

if (!values["skip-shots"]) {
    const run = spawnSync(
        "node",
        [
            join(app, "test/smoke/run-in-container.mjs"),
            "--",
            "node",
            "apps/orca-plugin/scripts/listing-images/shoot.mjs",
        ],
        { stdio: "inherit" },
    );
    if (run.status !== 0) process.exit(run.status ?? 1);
}

const fileUrl = (path) => pathToFileURL(path).href;
const font = createRequire(import.meta.url).resolve(
    "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2",
);
const html = readFileSync(join(here, "cover.html"), "utf8")
    .replace("__FONT__", fileUrl(font))
    .replace("__ICON__", fileUrl(join(repository, "docs/public/favicon-bpmn.svg")))
    .replace("__WORDMARK__", fileUrl(join(repository, "docs/public/logo/miragon-logo-weiss.svg")))
    .replace("__EDITOR__", fileUrl(join(shots, "bpmn-editor.png")))
    .replace("__TITLE__", "BPMN")
    .replace(
        "__CLAIM__",
        "Processes and decisions from plain .bpmn and .dmn files, edited by you and your agents.",
    );
const coverPage = join(shots, "cover.html");
writeFileSync(coverPage, html);

const browser = await chromium.launch();
try {
    // Chromium's canvas encodes the WEBP, scaling the double-resolution cover down on the way.
    const webp = async (png, width, height) => {
        const encoder = await browser.newPage();
        const dataUrl = await encoder.evaluate(
            async ({ source, width, height }) => {
                const image = new globalThis.Image();
                image.src = source;
                await image.decode();
                const canvas = globalThis.document.createElement("canvas");
                canvas.width = width ?? image.naturalWidth;
                canvas.height = height ?? image.naturalHeight;
                const context = canvas.getContext("2d");
                context.imageSmoothingQuality = "high";
                context.drawImage(image, 0, 0, canvas.width, canvas.height);
                return canvas.toDataURL("image/webp", 0.9);
            },
            { source: `data:image/png;base64,${png.toString("base64")}`, width, height },
        );
        await encoder.close();
        return Buffer.from(dataUrl.split(",")[1], "base64");
    };

    const page = await browser.newPage({
        viewport: { width: 1600, height: 1000 },
        deviceScaleFactor: 2,
    });
    await page.goto(fileUrl(coverPage));
    await page.evaluate(() => globalThis.document.fonts.ready);
    mkdirSync(images, { recursive: true });
    writeFileSync(join(images, "cover.webp"), await webp(await page.screenshot(), 1600, 1000));
    for (const feature of ["properties", "simulation", "linting", "dmn"]) {
        const window = readFileSync(join(shots, `${feature}-window.png`));
        writeFileSync(join(images, `screenshot-${feature}.webp`), await webp(window));
    }
    console.log(`[listing-images] ${images}`);
} finally {
    await browser.close();
}
