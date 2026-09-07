/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "編集中:",
    "Design": "デザイン",
    "Element actions": "要素アクション",
    "Implement": "実装",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "実装には Camunda 実行プラットフォームが必要ですが、このモデルにはありません。有効にするには割り当ててください。",
    "Mode": "モード",
    "Read-only": "読み取り専用",
    "View": "表示",
    "{mode} — open properties panel": "{mode} — プロパティパネルを開く",
};

export default dictionary;
