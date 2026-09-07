/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "正在編輯於",
    "Design": "設計",
    "Element actions": "元素操作",
    "Implement": "實作",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "「實作」需要 Camunda 執行平台，但此模型沒有。請指派一個以啟用。",
    "Mode": "模式",
    "Read-only": "唯讀",
    "View": "檢視",
    "{mode} — open properties panel": "{mode} — 開啟屬性面板",
};

export default dictionary;
