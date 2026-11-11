/// <reference types="vitest" />
import { readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig, type Plugin } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// The bundle carries these fonts (OFL-1.1) and icons (ISC); their licenses travel with it,
// so a host that ships the bundle needs no install of the webview's dependencies.
const THIRD_PARTY_LICENSES = {
    "geist.LICENSE": "@fontsource-variable/geist/LICENSE",
    "geist-mono.LICENSE": "@fontsource-variable/geist-mono/LICENSE",
    "lucide.LICENSE": "lucide/LICENSE",
};

function emitThirdPartyLicenses(): Plugin {
    return {
        name: "emit-third-party-licenses",
        apply: "build",
        generateBundle() {
            for (const [fileName, path] of Object.entries(THIRD_PARTY_LICENSES)) {
                this.emitFile({
                    type: "asset",
                    fileName: `licenses/${fileName}`,
                    source: readFileSync(resolve(__dirname, "../../node_modules", path)),
                });
            }
        },
    };
}

export default defineConfig({
    root: __dirname,
    cacheDir: "../../node_modules/.vite/modeler-plugin-add-ons-webview",
    plugins: [tsconfigPaths(), emitThirdPartyLicenses()],
    // "/" makes CSS url()s root-absolute, which 404 under the webview resource origin.
    base: "./",
    build: {
        target: "es2021",
        chunkSizeWarningLimit: 1200,
        outDir: "../../dist/webview-staging/add-ons-webview",
        emptyOutDir: true,
        rollupOptions: {
            input: {
                index: resolve(__dirname, "src/main.ts"),
            },
            output: {
                entryFileNames: `[name].js`,
                assetFileNames: "[name].[ext]",
            },
        },
    },
    define: {
        "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV),
    },
    server: {
        // portless proxies the dev server behind a `<name>.localhost` host; Vite
        // rejects unknown Host headers unless the suffix is allow-listed.
        allowedHosts: [".localhost"],
    },
});
