/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "The linked form is missing or invalid. Check the form reference.":
        "連結的表單不存在或無效。請檢查表單參照。",
    "Preview linked form": "預覽關聯表單",
    "Linked form preview": "關聯表單預覽",
    "Refresh": "重新整理",
    "Close form preview": "關閉表單預覽",
    "Read-only preview of the saved local form.": "已儲存本機表單的唯讀預覽。",
    "Saved form loaded.": "已載入儲存的表單。",
    "Open a workspace folder to preview linked forms.": "請開啟工作區資料夾以預覽關聯表單。",
    "No saved local form matches this reference. Refresh to try again.":
        "沒有與此參照相符的已儲存本機表單。請重新整理後再試。",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "多個已儲存表單與此參照相符。請選取要預覽的表單。",
    "The saved form could not be read. Refresh to try again.":
        "無法讀取已儲存的表單。請重新整理後再試。",
    "The host did not answer. Refresh to try again.": "主機未回應。請重新整理後再試。",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "已儲存的表單無效或不受支援。請在表單編輯器中開啟。",
    "The form preview could not be loaded. Refresh to try again.":
        "無法載入表單預覽。請重新整理後再試。",
    "Apply Template": "套用範本",
    "Automated work carried out by a Java delegate, expression, or external task":
        "由 Java delegate、表達式或外部任務執行的自動化工作",
    "Automated work carried out by a system": "由系統執行的自動化工作",
    "Being edited in": "正在編輯於",
    "Camunda properties, templates and lint": "Camunda 屬性、範本與檢查",
    "Child process": "子流程",
    "Clear search": "清除搜尋",
    "Close": "關閉",
    "Collapse": "收合",
    "Delegate": "Delegate",
    "Design": "設計",
    "Element Templates": "元素範本",
    "Element actions": "元素操作",
    "Engine-neutral modeling": "與引擎無關的建模",
    "Expand": "展開",
    "Favourites": "我的最愛",
    "Human": "人工",
    "Implement": "實作",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "「實作」需要 Camunda 執行平台，但此模型沒有。請指派一個以啟用。",
    "Java delegate": "Java delegate",
    "Mode": "模式",
    "Mode: {mode}": "模式：{mode}",
    "Name or code": "名稱或代碼",
    "No matches in other models": "其他模型中沒有相符項目",
    "No templates found": "找不到範本",
    "No visible parameters": "無可見參數",
    "Other": "其他",
    "Read-only": "唯讀",
    "Search failed": "搜尋失敗",
    "Search other models": "搜尋其他模型",
    "Search templates...": "搜尋範本...",
    "Search...": "搜尋...",
    "Searching…": "正在搜尋…",
    "Select a template to see its details": "選擇一個範本以查看其詳細資訊",
    "Task Type": "任務類型",
    "Try a different search term": "嘗試其他搜尋詞",
    "Unnamed": "未命名",
    "View": "檢視",
    "caught by {elements}": "捕獲方：{elements}",
    "double": "double",
    "integer": "integer",
    "optional": "選填",
    "read-only": "唯讀",
    "required": "必填",
    "thrown by {elements}": "拋出方：{elements}",
    "{count} properties": "{count} 個屬性",
    "{count} property": "{count} 個屬性",
};

export default dictionary;
