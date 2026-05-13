/**
 * This file can be edited to customize webpack configuration.
 * To reset delete this file and rerun theia build again.
 */
// @ts-check
const configs = require("./gen-webpack.config.js");
const nodeConfig = require("./gen-webpack.node.config.js");

module.exports = [...configs, nodeConfig.config];
