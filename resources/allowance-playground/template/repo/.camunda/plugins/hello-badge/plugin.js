// Registers the way camunda-modeler-plugin-helpers' registerBpmnJSPlugin does.
(function () {
    const BADGE_TEXT = "Hello badge v1";

    function HelloBadge(canvas) {
        const badge = globalThis.document.createElement("div");
        badge.className = "hello-badge";
        badge.textContent = BADGE_TEXT;
        canvas.getContainer().appendChild(badge);
    }
    HelloBadge.$inject = ["canvas"];

    globalThis.plugins = globalThis.plugins || [];
    globalThis.plugins.push({
        type: "bpmn.modeler.additionalModules",
        plugin: { __init__: ["helloBadge"], helloBadge: ["type", HelloBadge] },
    });
})();
