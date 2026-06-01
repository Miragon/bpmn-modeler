const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { TsconfigPathsPlugin } = require("tsconfig-paths-webpack-plugin");

// Load `<repo-root>/.env` (gitignored) into process.env so build-time-only
// values like the Miragon Cloud daemon URL can be baked into the bundle
// via DefinePlugin without leaking into OSS source.  Missing file is OK.
require("dotenv").config({
    path: path.resolve(__dirname, "../../.env"),
});

if (!process.env.MIRAGON_CLOUD_DAEMON_URL) {
    // Soft warning only — the build still produces a (non-functional)
    // bundle so CI without the secret can verify the compile step.
    // The runtime then refuses to start sync with a clear error.
    console.warn(
        "[bpmn-iq-vscode] MIRAGON_CLOUD_DAEMON_URL is not set; the resulting bundle will refuse to start sync.",
    );
}

/**
 * Standalone webpack configuration for the bundled Miragon BPMN-IQ.
 *
 * Bundles the BPMN/DMN modeler (`apps/modeler-plugin/src/`) and the
 * cloud-only bpmn-iq sync code (`apps/bpmn-iq-vscode/src/`) into a
 * single VS Code extension `main.js`.  The cloud daemon URL is baked in at
 * build time via DefinePlugin from `<repo-root>/.env`.
 *
 * - Target: Node (VS Code extension host)
 * - Entry: src/main.ts (calls modeler + bpmn-iq activation)
 * - Output: ../../dist/apps/bpmn-iq-vscode/
 * - Externalises the `vscode` module
 * - Copies the modeler's webview build artefacts, themes, and assets so the
 *   resulting `.vsix` is fully self-contained
 *
 * @param {object} env
 * @param {{ mode: "production" | "development" }} argv
 * @returns {import("webpack").Configuration}
 */
module.exports = (env, argv) => {
    const isProd = argv.mode === "production";

    return {
        target: "node",
        mode: isProd ? "production" : "development",
        entry: "./src/main.ts",
        output: {
            path: path.resolve(__dirname, "../../dist/apps/bpmn-iq-vscode"),
            filename: "main.js",
            libraryTarget: "commonjs2",
        },
        resolve: {
            extensions: [".ts", ".js"],
            plugins: [
                // Resolves @miragon/* path aliases from tsconfig.base.json.
                new TsconfigPathsPlugin({
                    configFile: path.resolve(__dirname, "tsconfig.app.json"),
                    baseUrl: path.resolve(__dirname, "../.."),
                }),
            ],
        },
        externals: {
            vscode: "commonjs vscode",
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "ts-loader",
                        options: {
                            configFile: path.resolve(__dirname, "tsconfig.app.json"),
                        },
                    },
                },
                {
                    // ESM packages (e.g. @miragon/bpmn-iq-daemon-client) emit
                    // `import "./index.js"` specifiers webpack otherwise rejects.
                    test: /\.m?js$/,
                    resolve: { fullySpecified: false },
                },
            ],
        },
        plugins: [
            // Bake build-time configuration into the bundle.  Anything not
            // set in the user's local `.env` (or in CI env) becomes the
            // empty string at runtime; the bpmn-iq controller surfaces a
            // clear error and refuses to start sync.
            new webpack.DefinePlugin({
                "process.env.MIRAGON_CLOUD_DAEMON_URL": JSON.stringify(
                    process.env.MIRAGON_CLOUD_DAEMON_URL ?? "",
                ),
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: path.resolve(__dirname, "package.json"),
                        to: ".",
                        transform: (content) => {
                            const pkg = JSON.parse(content.toString());
                            delete pkg.devDependencies;
                            delete pkg.scripts;
                            return JSON.stringify(pkg, null, 2);
                        },
                    },
                    {
                        from: path.resolve(__dirname, "../modeler-plugin/assets"),
                        to: "assets",
                        noErrorOnMissing: true,
                    },
                    {
                        from: path.resolve(__dirname, "../../images/miragon-logo.png"),
                        to: "assets",
                        noErrorOnMissing: true,
                    },
                    {
                        // Single source of truth: themes live in the standalone
                        // extension lib. `vsce package --no-dependencies` strips
                        // node_modules, so the JSON must be present in dist.
                        from: path.resolve(__dirname, "../../libs/standalone-extension/src/themes"),
                        to: "themes",
                    },
                    {
                        from: path.resolve(__dirname, "../../LICENSE"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                    {
                        from: path.resolve(__dirname, "README.md"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                    {
                        // info.minimized prevents TerserPlugin from re-minimizing the
                        // already-minified Vite output, which would mangle variable
                        // names and break preact/htm tagged templates at runtime.
                        from: path.resolve(__dirname, "../../dist/webview-staging/bpmn-webview"),
                        to: "bpmn-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                    {
                        from: path.resolve(__dirname, "../../dist/webview-staging/dmn-webview"),
                        to: "dmn-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                    {
                        from: path.resolve(
                            __dirname,
                            "../../dist/webview-staging/deployment-webview",
                        ),
                        to: "deployment-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                ],
            }),
        ],
        devtool: isProd ? false : "source-map",
        watchOptions: {
            ignored: [
                "**/node_modules/**",
                path.resolve(__dirname, "../../dist/apps/bpmn-iq-vscode/**"),
            ],
        },
    };
};
