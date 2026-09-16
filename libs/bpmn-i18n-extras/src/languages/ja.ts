/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "テンプレートを適用",
    "Being edited in": "編集中:",
    "Clear search": "検索をクリア",
    "Close": "閉じる",
    "Collapse": "折りたたむ",
    "Delegate": "Delegate",
    "Design": "デザイン",
    "Element Templates": "要素テンプレート",
    "Element actions": "要素アクション",
    "Expand": "展開",
    "Favourites": "お気に入り",
    "Implement": "実装",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "実装には Camunda 実行プラットフォームが必要ですが、このモデルにはありません。有効にするには割り当ててください。",
    "Mode": "モード",
    "No templates found": "テンプレートが見つかりません",
    "No visible parameters": "表示可能なパラメータがありません",
    "Other": "その他",
    "Read-only": "読み取り専用",
    "Search templates...": "テンプレートを検索...",
    "Search...": "検索...",
    "Select a template to see its details": "詳細を表示するにはテンプレートを選択してください",
    "Task Type": "タスクタイプ",
    "Try a different search term": "別の検索語を試してください",
    "Unnamed": "名前なし",
    "View": "表示",
    "double": "double",
    "integer": "integer",
    "optional": "任意",
    "read-only": "読み取り専用",
    "required": "必須",
    "{count} properties": "{count} 個のプロパティ",
    "{mode} — open properties panel": "{mode} — プロパティパネルを開く",
};

export default dictionary;
