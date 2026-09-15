/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "套用範本",
    "Being edited in": "正在編輯於",
    "Clear search": "清除搜尋",
    "Close": "關閉",
    "Collapse": "收合",
    "Delegate": "Delegate",
    "Design": "設計",
    "Element Templates": "元素範本",
    "Element actions": "元素操作",
    "Expand": "展開",
    "Favourites": "我的最愛",
    "Implement": "實作",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "「實作」需要 Camunda 執行平台，但此模型沒有。請指派一個以啟用。",
    "Mode": "模式",
    "No templates found": "找不到範本",
    "No visible parameters": "無可見參數",
    "Other": "其他",
    "Read-only": "唯讀",
    "Search templates...": "搜尋範本...",
    "Search...": "搜尋...",
    "Select a template to see its details": "選擇一個範本以查看其詳細資訊",
    "Task Type": "任務類型",
    "Try a different search term": "嘗試其他搜尋詞",
    "Unnamed": "未命名",
    "View": "檢視",
    "double": "double",
    "integer": "integer",
    "optional": "選填",
    "read-only": "唯讀",
    "required": "必填",
    "{count} properties": "{count} 個屬性",
    "{mode} — open properties panel": "{mode} — 開啟屬性面板",
};

export default dictionary;
