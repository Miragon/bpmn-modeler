const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const { TsconfigPathsPlugin } = require("tsconfig-paths-webpack-plugin");

/**
 * Standalone webpack configuration for the bpmn-modeler VS Code extension.
 * Replaces the previous @nx/webpack-based setup.
 *
 * Key characteristics:
 * - Target: Node (VS Code extension host)
 * - Entry: src/main.ts
 * - Output: ../../dist/apps/vscode-plugin/
 * - Externalises the `vscode` module (provided by VS Code at runtime)
 * - Resolves @bpmn-modeler/* path aliases via TsconfigPathsPlugin
 * - Copies package.json (without devDependencies/scripts), assets, and webview dist folders
 *
 * @param {object} env - Webpack environment variables
 * @param {{ mode: "production" | "development" }} argv - Webpack CLI arguments
 * @returns {import("webpack").Configuration}
 */
module.exports = (env, argv) => {
    const isProd = argv.mode === "production";

    return {
        target: "node",
        mode: isProd ? "production" : "development",
        entry: "./src/main.ts",
        output: {
            path: path.resolve(__dirname, "../../dist/apps/vscode-plugin"),
            filename: "main.js",
            libraryTarget: "commonjs2",
        },
        resolve: {
            extensions: [".ts", ".js"],
            plugins: [
                // Resolves @bpmn-modeler/* path aliases from tsconfig.app.json.
                new TsconfigPathsPlugin({
                    configFile: path.resolve(__dirname, "tsconfig.app.json"),
                    baseUrl: path.resolve(__dirname, "../.."),
                }),
            ],
        },
        externals: {
            // The vscode module is provided by VS Code at runtime and must not be bundled.
            vscode: "commonjs vscode",
        },
        // bpmnlint's NodeResolver resolves workspace rule modules through a runtime
        // `Module.createRequire` (scoped to the .bpmnlintrc dir) that we always pass
        // in, so its `|| require` fallback is dead code webpack can't statically
        // analyse. The "Critical dependency" warning it raises is expected, not a bug.
        ignoreWarnings: [
            {
                module: /bpmnlint[\\/]lib[\\/]resolver[\\/]node-resolver\.js$/,
                message: /Critical dependency: require function is used/,
            },
        ],
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: {
                        loader: "ts-loader",
                        options: {
                            configFile: path.resolve(__dirname, "tsconfig.app.json"),
                        },
                    },
                    exclude: /node_modules/,
                },
            ],
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {
                        // Copy the extension manifest, stripping devDependencies and scripts
                        // to keep the distributable package.json lean.
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
                        from: path.resolve(__dirname, ".vscodeignore"),
                        to: ".",
                    },
                    {
                        from: path.resolve(__dirname, "assets"),
                        to: "assets",
                    },
                    {
                        // File-explorer icons referenced by contributes.languages[].icon,
                        // resolved relative to the packaged extension root.
                        from: path.resolve(__dirname, "icons"),
                        to: "icons",
                    },
                    {
                        // TextMate grammars + shared language configuration referenced by
                        // contributes.grammars/languages, resolved relative to the root.
                        from: path.resolve(__dirname, "syntaxes"),
                        to: "syntaxes",
                    },
                    {
                        // Walkthrough markdown referenced by contributes.walkthroughs.
                        from: path.resolve(__dirname, "media"),
                        to: "media",
                        noErrorOnMissing: true,
                    },
                    {
                        // Single source of truth: the manifest JSON Schema lives in
                        // libs/shared next to the type it mirrors. Copied (not
                        // imported) because `contributes.jsonValidation.url` resolves
                        // it as a file relative to the packaged extension root.
                        from: path.resolve(
                            __dirname,
                            "../../libs/shared/src/lib/variableManifest.schema.json",
                        ),
                        to: "schemas/bpmn-vars.schema.json",
                    },
                    {
                        from: path.resolve(
                            __dirname,
                            "../../node_modules/@bpmn-io/form-json-schema/resources/schema.json",
                        ),
                        to: "schemas/form.schema.json",
                    },
                    {
                        from: path.resolve(__dirname, "../../images/miragon-logo.png"),
                        to: "assets",
                        noErrorOnMissing: true,
                    },
                    {
                        from: path.resolve(__dirname, "../../LICENSE"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                    {
                        // The Marketplace listing is rendered from the README
                        // bundled into the VSIX. Always use the workspace-local
                        // README so each extension's listing is self-contained.
                        from: path.resolve(__dirname, "README.md"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                    {
                        // Copy the BPMN webview build artefacts into the extension output.
                        // info.minimized prevents TerserPlugin from re-minimizing the
                        // already-minified Vite output, which would mangle variable names
                        // and break preact/htm tagged templates at runtime.
                        from: path.resolve(__dirname, "../../dist/webview-staging/bpmn-webview"),
                        to: "bpmn-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                    {
                        // Copy the DMN webview build artefacts into the extension output.
                        from: path.resolve(__dirname, "../../dist/webview-staging/dmn-webview"),
                        to: "dmn-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                    {
                        // Copy the form webview build artefacts into the extension output.
                        from: path.resolve(__dirname, "../../dist/webview-staging/form-webview"),
                        to: "form-webview",
                        noErrorOnMissing: true,
                        info: { minimized: true },
                    },
                    {
                        from: path.resolve(
                            __dirname,
                            "../../node_modules/@bpmn-io/form-js/LICENSE",
                        ),
                        to: "licenses/form-js.LICENSE",
                    },
                    {
                        from: path.resolve(
                            __dirname,
                            "../../node_modules/@bpmn-io/form-json-schema/LICENSE",
                        ),
                        to: "licenses/form-json-schema.LICENSE",
                    },
                    {
                        // Copy the deployment webview build artefacts into the extension output.
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
            // Prevent webpack from watching its own output, which would otherwise
            // cause an infinite rebuild loop when CopyWebpackPlugin writes files.
            // The glob suffix `/**` is required for anymatch to treat this as a
            // pattern covering all files inside the directory, not just the path itself.
            ignored: [
                "**/node_modules/**",
                path.resolve(__dirname, "../../dist/apps/vscode-plugin/**"),
            ],
        },
    };
};
