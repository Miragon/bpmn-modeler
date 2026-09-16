# Deploy your diagram

Once a `.bpmn` diagram is open, you can deploy it to a running engine without
leaving VS Code:

- Open the **Deploy Diagram** view from the activity bar (the 🚀 rocket
  icon), or run **BPMN Modeler: Deploy Diagram** from the editor title bar.
- The modeler supports both **Camunda 7** and **Camunda 8** — pick the engine
  version that matches your target cluster.
- Save your dev/staging/prod connections as named **deployment targets** (stored
  in `.camunda/deployment-targets.json`, secrets kept out of the file) and switch
  between them from the status bar. **Deploy Files…** deploys several diagrams to
  the active target at once.

This step is optional: the modeler is fully usable for authoring diagrams even
if you never deploy from here.
