// Theia regenerates the imported options; keep the native ripgrep override here.
import process from "node:process";
import { browserOptions, watch } from "./gen-esbuild.browser.mjs";
import { nodeOptions } from "./gen-esbuild.node.mjs";
import { electronOptions } from "./gen-esbuild.electron.mjs";
import esbuild from "esbuild";
import { ripgrepAsarPlugin } from "./scripts/ripgrep-asar-plugin.mjs";

nodeOptions.plugins.unshift(ripgrepAsarPlugin);

const browserContext = await esbuild.context(browserOptions);
const nodeContext = await esbuild.context(nodeOptions);
const electronContext = await esbuild.context(electronOptions);

if (watch) {
    await Promise.all([browserContext.watch(), nodeContext.watch(), electronContext.watch()]);
} else {
    try {
        await browserContext.rebuild();
        await browserContext.dispose();
        await nodeContext.rebuild();
        await nodeContext.dispose();
        await electronContext.rebuild();
        await electronContext.dispose();
    } catch {
        process.exit(1);
    }
}
