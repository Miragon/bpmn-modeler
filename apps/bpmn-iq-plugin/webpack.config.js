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

/**
 * Standalone webpack configuration for the bpmn-iq VS Code extension.
 *
 * - Target: Node (VS Code extension host)
 * - Entry: src/main.ts
 * - Output: ../../dist/apps/bpmn-iq-plugin/
 * - Externalises the `vscode` module
 * - `fullySpecified: false` is required for the ESM
 *   `@miragon/bpmn-iq-daemon-client` package to bundle.
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
            path: path.resolve(__dirname, "../../dist/apps/bpmn-iq-plugin"),
            filename: "main.js",
            libraryTarget: "commonjs2",
        },
        resolve: {
            extensions: [".ts", ".js"],
            plugins: [
                new TsconfigPathsPlugin({
                    configFile: path.resolve(__dirname, "tsconfig.app.json"),
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
                    // `import "./index.js"` specifiers Webpack otherwise rejects.
                    test: /\.m?js$/,
                    resolve: { fullySpecified: false },
                },
            ],
        },
        plugins: [
            // Bake build-time configuration into the bundle.  Anything not
            // set in the user's local `.env` (or in CI env) becomes the
            // empty string at runtime — features that depend on these
            // values are expected to handle empty gracefully.
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
                        from: path.resolve(__dirname, "assets"),
                        to: "assets",
                        noErrorOnMissing: true,
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
                        from: path.resolve(__dirname, "README.md"),
                        to: ".",
                        noErrorOnMissing: true,
                    },
                ],
            }),
        ],
        devtool: isProd ? false : "source-map",
        watchOptions: {
            ignored: [
                "**/node_modules/**",
                path.resolve(__dirname, "../../dist/apps/bpmn-iq-plugin/**"),
            ],
        },
    };
};
