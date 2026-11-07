// Registers the way camunda-modeler-plugin-helpers' registerBpmnJSPlugin does.
(function () {
    function SmokeTrace(canvas) {
        const container = canvas.getContainer();
        container.classList.add("smoke-plugin-trace");
        const badge = globalThis.document.createElement("div");
        badge.className = "smoke-plugin-badge";
        badge.textContent = "Smoke trace plugin";
        container.appendChild(badge);
    }
    SmokeTrace.$inject = ["canvas"];

    globalThis.plugins = globalThis.plugins || [];
    globalThis.plugins.push({
        type: "bpmn.modeler.additionalModules",
        plugin: { __init__: ["smokeTrace"], smokeTrace: ["type", SmokeTrace] },
    });
})();
