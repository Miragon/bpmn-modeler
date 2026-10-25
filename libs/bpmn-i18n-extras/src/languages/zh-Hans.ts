/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "应用模板",
    "Automated work carried out by a Java delegate, expression, or external task":
        "由 Java delegate、表达式或外部任务执行的自动化工作",
    "Automated work carried out by a system": "由系统执行的自动化工作",
    "Being edited in": "正在编辑于",
    "Camunda properties, templates and lint": "Camunda 属性、模板和校验",
    "Child process": "子流程",
    "Clear search": "清除搜索",
    "Close": "关闭",
    "Collapse": "折叠",
    "Delegate": "Delegate",
    "Design": "设计",
    "Element Templates": "元素模板",
    "Element actions": "元素操作",
    "Engine-neutral modeling": "与引擎无关的建模",
    "Expand": "展开",
    "Favourites": "收藏夹",
    "Human": "人工",
    "Implement": "实现",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "“实现”需要 Camunda 执行平台，但此模型没有。请分配一个以启用。",
    "Java delegate": "Java delegate",
    "Mode": "模式",
    "Mode: {mode}": "模式：{mode}",
    "Name or code": "名称或代码",
    "No matches in other models": "其他模型中没有匹配项",
    "No templates found": "未找到模板",
    "No visible parameters": "无可见参数",
    "Other": "其他",
    "Read-only": "只读",
    "Search failed": "搜索失败",
    "Search other models": "搜索其他模型",
    "Search templates...": "搜索模板...",
    "Search...": "搜索...",
    "Searching…": "正在搜索…",
    "Select a template to see its details": "选择一个模板以查看其详细信息",
    "Task Type": "任务类型",
    "Try a different search term": "尝试其他搜索词",
    "Unnamed": "未命名",
    "View": "查看",
    "caught by {elements}": "捕获方：{elements}",
    "double": "double",
    "integer": "integer",
    "optional": "可选",
    "read-only": "只读",
    "required": "必填",
    "thrown by {elements}": "抛出方：{elements}",
    "{count} properties": "{count} 个属性",
};

export default dictionary;
