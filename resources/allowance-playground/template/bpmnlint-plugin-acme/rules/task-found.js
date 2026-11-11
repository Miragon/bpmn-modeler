// Read when the module loads, so the message names the version that runs, not the one on disk.
const { version } = require("../package.json");

module.exports = function () {
    function check(node, reporter) {
        if (node.$type === "bpmn:Task") {
            reporter.report(node.id, `acme ${version}: task "${node.name}" found`);
        }
    }

    return { check };
};
