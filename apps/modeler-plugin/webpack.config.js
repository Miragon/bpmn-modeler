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
 * - Output: ../../dist/apps/modeler-plugin/
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
            path: path.resolve(__dirname, "../../dist/apps/modeler-plugin"),
            filename: "main.js",
            libraryTarget: "commonjs2",
        },
        resolve: {
            extensions: [".ts", ".js"],
            plugins: [
                // Resolves @bpmn-modeler/* path aliases from tsconfig.app.json.
                new TsconfigPathsPlugin({
                    configFile: path.resolve(__dirname, "tsconfig.app.json"),
                }),
            ],
        },
        externals: {
            // The vscode module is provided by VS Code at runtime and must not be bundled.
            vscode: "commonjs vscode",
        },
        module: {
            rules: [
                {
                    test: /\.ts$/,
                    use: "ts-loader",
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
                        from: path.resolve(__dirname, "assets"),
                        to: "assets",
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
                        from: path.resolve(__dirname, "../../README.md"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                    {
                        // Copy the BPMN webview build artefacts into the extension output.
                        from: path.resolve(
                            __dirname,
                            "../../dist/webview-staging/bpmn-webview",
                        ),
                        to: "bpmn-webview",
                        noErrorOnMissing: true,
                    },
                    {
                        // Copy the DMN webview build artefacts into the extension output.
                        from: path.resolve(
                            __dirname,
                            "../../dist/webview-staging/dmn-webview",
                        ),
                        to: "dmn-webview",
                        noErrorOnMissing: true,
                    },
                    {
                        // Copy the deployment webview build artefacts into the extension output.
                        from: path.resolve(
                            __dirname,
                            "../../dist/webview-staging/deployment-webview",
                        ),
                        to: "deployment-webview",
                        noErrorOnMissing: true,
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
                path.resolve(__dirname, "../../dist/apps/modeler-plugin/**"),
            ],
        },
    };
};
