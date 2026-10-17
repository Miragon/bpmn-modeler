# Deep Links

A diagram is only citable if you can point at a *part* of it. Deep links give
every element in a `.bpmn` or `.dmn` file a URL that opens the modeler on that
element:

```
vscode://miragon-gmbh.vs-code-bpmn-modeler/open?file=/abs/path/order.bpmn&element=Task_Approve
```

Clicking it opens `order.bpmn` in the modeler — revealing the tab if the file is
already open — then selects `Task_Approve` and centres the canvas on it.

## Parameters

| Parameter | Required | Meaning |
|-----------|----------|---------|
| `file`    | yes      | The diagram to open: an absolute path (`/work/order.bpmn`, `C:\work\order.bpmn`) or a full `file:///…` URI. URL-encode it. |
| `element` | no       | The BPMN/DMN element id to select and centre. Without it the link just opens the file. |

Only `.bpmn` and `.dmn` targets are opened. A link to any other path is
rejected — the link arrives from outside the editor, so it is not a general
"open this file" mechanism.

## Where the links are useful

- **Review comments and tickets.** "The retry limit is wrong on
  `Task_ChargeCard`" becomes a link the reader lands on, instead of a
  file name plus a hunt.
- **Generated documentation.** A process report can link each step back to the
  element it describes.
- **Code comments.** Next to the delegate that implements a service task, a link
  back to the task that calls it.
- **Chat.** Paste the link instead of a screenshot.

## Building a link

The `file` parameter must be URL-encoded:

```js
const link =
    "vscode://miragon-gmbh.vs-code-bpmn-modeler/open" +
    `?file=${encodeURIComponent("/work/order.bpmn")}` +
    `&element=${encodeURIComponent("Task_Approve")}`;
```

In Markdown, wrap it as a normal link:

```md
[Approve step](vscode://miragon-gmbh.vs-code-bpmn-modeler/open?file=%2Fwork%2Forder.bpmn&element=Task_Approve)
```

## Notes

- The element is focused even on a cold open: a focus request that arrives
  before the diagram has finished importing is buffered and applied once it
  has.
- An element id that no longer exists opens the diagram and leaves the viewport
  where it was.
- VS Code asks for confirmation the first time an external application opens a
  `vscode://` link.
