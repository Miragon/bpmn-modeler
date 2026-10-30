/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Preview linked form": "リンクされたフォームをプレビュー",
    "Linked form preview": "リンクされたフォームのプレビュー",
    "Refresh": "更新",
    "Close form preview": "フォームのプレビューを閉じる",
    "Read-only preview of the saved local form.":
        "保存済みローカルフォームの読み取り専用プレビューです。",
    "Saved form loaded.": "保存済みフォームを読み込みました。",
    "Open a workspace folder to preview linked forms.":
        "リンクされたフォームをプレビューするにはワークスペースフォルダーを開いてください。",
    "No saved local form matches this reference. Refresh to try again.":
        "参照に一致する保存済みローカルフォームがありません。更新して再試行してください。",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "参照に一致する保存済みフォームが複数あります。プレビューするフォームを選択してください。",
    "The saved form could not be read. Refresh to try again.":
        "保存済みフォームを読み取れませんでした。更新して再試行してください。",
    "The host did not answer. Refresh to try again.":
        "ホストから応答がありませんでした。更新して再試行してください。",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "保存済みフォームが無効か未対応です。フォームエディターで開いてください。",
    "The form preview could not be loaded. Refresh to try again.":
        "フォームのプレビューを読み込めませんでした。更新して再試行してください。",
    "Apply Template": "テンプレートを適用",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Java デリゲート、式、または外部タスクが実行する自動化された作業です",
    "Automated work carried out by a system": "システムが実行する自動化された作業です",
    "Being edited in": "編集中:",
    "Camunda properties, templates and lint": "Camunda のプロパティ、テンプレート、リント",
    "Child process": "子プロセス",
    "Clear search": "検索をクリア",
    "Close": "閉じる",
    "Collapse": "折りたたむ",
    "Delegate": "Delegate",
    "Design": "デザイン",
    "Element Templates": "要素テンプレート",
    "Element actions": "要素アクション",
    "Engine-neutral modeling": "エンジン非依存のモデリング",
    "Expand": "展開",
    "Favourites": "お気に入り",
    "Human": "人",
    "Implement": "実装",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "実装には Camunda 実行プラットフォームが必要ですが、このモデルにはありません。有効にするには割り当ててください。",
    "Java delegate": "Java デリゲート",
    "Mode": "モード",
    "Mode: {mode}": "モード: {mode}",
    "Name or code": "名前またはコード",
    "No matches in other models": "他のモデルに一致するものはありません",
    "No templates found": "テンプレートが見つかりません",
    "No visible parameters": "表示可能なパラメータがありません",
    "Other": "その他",
    "Read-only": "読み取り専用",
    "Search failed": "検索に失敗しました",
    "Search other models": "他のモデルを検索",
    "Search templates...": "テンプレートを検索...",
    "Search...": "検索...",
    "Searching…": "検索中…",
    "Select a template to see its details": "詳細を表示するにはテンプレートを選択してください",
    "Task Type": "タスクタイプ",
    "Try a different search term": "別の検索語を試してください",
    "Unnamed": "名前なし",
    "View": "表示",
    "caught by {elements}": "キャッチ元: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "任意",
    "read-only": "読み取り専用",
    "required": "必須",
    "thrown by {elements}": "スロー元: {elements}",
    "{count} properties": "{count} 個のプロパティ",
    "{count} property": "{count} 個のプロパティ",
};

export default dictionary;
