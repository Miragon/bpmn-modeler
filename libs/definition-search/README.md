# `@miragon/bpmn-modeler-definition-search`

Adds **Search other models** as the last entry of the message, signal, error and escalation groups of the
properties panel. `@miragon/bpmn-modeler` registers it when the host supplies
`capabilities.definitionSearch`.

Internal workspace, not published on its own.

## How it works

- Results come from the `DefinitionSearchPort` the host supplies; `createDefinitionSearchModule(port)`
  carries it.
- BPMN cannot reference a definition in another file, so picking a result copies the definition into the
  current model, or reuses an equal one, and links it. The saved file stays self-contained.
- Hosts that build their own index use `extractModelDefinitions(xml)` from `@miragon/bpmn-modeler-types`,
  which lists a file's definitions with the elements that throw or catch them.
