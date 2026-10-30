/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Preview linked form": "预览关联表单",
    "Linked form preview": "关联表单预览",
    "Refresh": "刷新",
    "Close form preview": "关闭表单预览",
    "Read-only preview of the saved local form.": "已保存本地表单的只读预览。",
    "Saved form loaded.": "已加载保存的表单。",
    "Open a workspace folder to preview linked forms.": "请打开工作区文件夹以预览关联表单。",
    "No saved local form matches this reference. Refresh to try again.":
        "没有与此引用匹配的已保存本地表单。请刷新重试。",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "多个已保存表单与此引用匹配。请选择要预览的表单。",
    "The saved form could not be read. Refresh to try again.": "无法读取已保存的表单。请刷新重试。",
    "The host did not answer. Refresh to try again.": "主机未响应。请刷新重试。",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "已保存的表单无效或不受支持。请在表单编辑器中打开。",
    "The form preview could not be loaded. Refresh to try again.": "无法加载表单预览。请刷新重试。",
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
    "{count} property": "{count} 个属性",
};

export default dictionary;
