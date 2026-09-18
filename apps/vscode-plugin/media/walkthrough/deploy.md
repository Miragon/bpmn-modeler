# Deploy your diagram

Once a `.bpmn` diagram is open, you can deploy it to a running engine without
leaving VS Code:

- Click the 🚀 rocket in the editor title bar to **save and deploy the current
  diagram** to the active target in one step (you're prompted to pick a target
  the first time). Open the full **Deployment** sidebar from the activity bar
  when you need additional resources or a custom deployment name.
- The modeler supports both **Camunda 7** and **Camunda 8** — pick the engine
  version that matches your target cluster.
- Save your dev/staging/prod connections as named **deployment targets** (stored
  in `.camunda/deployment-targets.json`, secrets kept out of the file) and switch
  between them from the status bar. **Deploy Files…** deploys several diagrams to
  the active target at once.
- The status-bar dot tracks deployment freshness; on a Camunda 7 target,
  **Verify Deployment on Engine** checks it against what the engine really runs.

This step is optional: the modeler is fully usable for authoring diagrams even
if you never deploy from here.
