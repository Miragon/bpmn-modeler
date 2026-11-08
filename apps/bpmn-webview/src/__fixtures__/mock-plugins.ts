import type { BpmnPluginAsset } from "@miragon/bpmn-modeler-shared";

/**
 * Plugins for the browser preview (`?plugins`), one per extension point. Each
 * registers exactly as `camunda-modeler-plugin-helpers` does, by pushing onto
 * `window.plugins`, and uses only injected services, so no bundled copy of
 * diagram-js is needed. They are served as `blob:` URLs, the way a frame with
 * no file server would have to load them.
 */
interface MockPlugin {
    readonly name: string;
    readonly script: string;
    readonly style?: string;
}

const register = (type: string, plugin: string) =>
    `(window.plugins = window.plugins || []).push({ type: ${JSON.stringify(type)}, plugin: ${plugin} });`;

const isTask =
    "function (element) { return element.businessObject && element.businessObject.$instanceOf('bpmn:Task'); }";

const MOCK_PLUGINS: readonly MockPlugin[] = [
    {
        name: "Resize Tasks (rules)",
        script: `(function () {
  var isTaskElement = ${isTask};
  function ResizeTasks(eventBus) {
    eventBus.on('commandStack.shape.resize.canExecute', 2000, function (event) {
      if (isTaskElement(event.context.shape)) { return true; }
    });
  }
  ResizeTasks.$inject = ['eventBus'];
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['resizeTasks'], resizeTasks: ['type', ResizeTasks] }")}
})();`,
    },
    {
        name: "Reduced Palette (palette)",
        script: `(function () {
  function ReducedPalette(palette) { palette.registerProvider(500, this); }
  ReducedPalette.prototype.getPaletteEntries = function () {
    return function (entries) {
      delete entries['create.data-store'];
      delete entries['create.data-object'];
      delete entries['create.group'];
      return entries;
    };
  };
  ReducedPalette.$inject = ['palette'];
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['reducedPalette'], reducedPalette: ['type', ReducedPalette] }")}
})();`,
    },
    {
        name: "Id Badges (overlays + style)",
        script: `(function () {
  var isTaskElement = ${isTask};
  function IdBadges(eventBus, overlays, elementRegistry) {
    eventBus.on('import.done', function () {
      elementRegistry.filter(isTaskElement).forEach(function (element) {
        overlays.add(element, 'plugin-id-badge', {
          position: { bottom: -4, left: 0 },
          html: '<div class="plugin-id-badge">' + element.id + '</div>'
        });
      });
    });
  }
  IdBadges.$inject = ['eventBus', 'overlays', 'elementRegistry'];
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['idBadges'], idBadges: ['type', IdBadges] }")}
})();`,
        style: ".plugin-id-badge { background: rgb(255, 213, 79); color: #000; font: 10px monospace; padding: 1px 3px; border-radius: 3px; }",
    },
    {
        name: "Technical IDs (modeling command)",
        script: `(function () {
  var isTaskElement = ${isTask};
  function TechnicalIds(eventBus, modeling) {
    eventBus.on('commandStack.shape.create.postExecuted', function (event) {
      var shape = event.context.shape;
      if (isTaskElement(shape) && shape.id.indexOf('ACME_') !== 0) {
        modeling.updateProperties(shape, { id: 'ACME_' + Math.random().toString(36).slice(2, 8) });
      }
    });
  }
  TechnicalIds.$inject = ['eventBus', 'modeling'];
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['technicalIds'], technicalIds: ['type', TechnicalIds] }")}
})();`,
    },
    {
        name: "Acme Moddle (moddle extension)",
        script: `(function () {
  ${register(
      "bpmn.modeler.moddleExtension",
      JSON.stringify({
          name: "Acme",
          uri: "http://acme.example/schema/bpmn/1.0",
          prefix: "acme",
          xml: { tagAlias: "lowerCase" },
          types: [
              {
                  name: "Owned",
                  extends: ["bpmn:BaseElement"],
                  properties: [{ name: "team", isAttr: true, type: "String" }],
              },
          ],
      }),
  )}
})();`,
    },
    {
        name: "Engine Flags (engine-specific)",
        script: `(function () {
  function flag(name) { function Flag() { window[name] = true; } return Flag; }
  ${register("bpmn.platform.modeler.additionalModules", "{ __init__: ['c7Flag'], c7Flag: ['type', flag('__pluginC7Loaded')] }")}
  ${register("bpmn.cloud.modeler.additionalModules", "{ __init__: ['c8Flag'], c8Flag: ['type', flag('__pluginC8Loaded')] }")}
  ${register("client", "function CommentsSidebar() { return null; }")}
})();`,
    },
    {
        name: "Probe (exposes the injector for checks)",
        script: `(function () {
  function Probe(injector) { window.__bpmnPluginInjector = injector; }
  Probe.$inject = ['injector'];
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['pluginProbe'], pluginProbe: ['type', Probe] }")}
})();`,
    },
    {
        name: "Throws While Loading",
        script: "(function () { throw new Error('plugin bug at load time'); })();",
    },
];

const BROKEN_CONSTRUCTOR: MockPlugin = {
    name: "Broken Constructor",
    script: `(function () {
  function Broken() { throw new Error('plugin bug in its constructor'); }
  ${register("bpmn.modeler.additionalModules", "{ __init__: ['broken'], broken: ['type', Broken] }")}
})();`,
};

function blobUrl(text: string, type: string): string {
    return URL.createObjectURL(new Blob([text], { type }));
}

/** `?plugins` serves the set above; `?plugins=broken` adds one whose constructor throws. */
export function mockPluginAssets(variant: string | null): BpmnPluginAsset[] {
    if (variant === null) {
        return [];
    }
    const plugins = variant === "broken" ? [...MOCK_PLUGINS, BROKEN_CONSTRUCTOR] : MOCK_PLUGINS;
    return plugins.map((plugin) => ({
        name: plugin.name,
        scriptUrl: blobUrl(plugin.script, "text/javascript"),
        ...(plugin.style === undefined ? {} : { styleUrl: blobUrl(plugin.style, "text/css") }),
    }));
}
