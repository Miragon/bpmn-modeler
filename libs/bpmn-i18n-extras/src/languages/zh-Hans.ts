/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "正在编辑于",
    "Design": "设计",
    "Element actions": "元素操作",
    "Implement": "实现",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "“实现”需要 Camunda 执行平台，但此模型没有。请分配一个以启用。",
    "Mode": "模式",
    "Read-only": "只读",
    "View": "查看",
    "{mode} — open properties panel": "{mode} — 打开属性面板",
};

export default dictionary;
