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
        "リンクされたフォームが見つからないか無効です。フォームの参照を確認してください。",
    "Preview linked form": "リンクされたフォームをプレビュー",
    "Fit diagram to view": "ダイアグラムを画面に合わせる",
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
    "Changes": "変更",
    "No changes": "変更なし",
    "Show all": "すべて表示",
    "Show XML changes": "XML の変更を表示",
    "Old version": "旧バージョン",
    "New version": "新バージョン",
    "Not in this version": "このバージョンにはありません",
    "It was removed. The version on the left shows it.":
        "削除されました。左側のバージョンに表示されています。",
    "It is new. The version on the right shows it.":
        "新しく追加されました。右側のバージョンに表示されています。",
    "A form is either a form id or an external reference, not both.":
        "フォームに指定できるのは、フォーム ID か外部参照のどちらか一方だけです。",
    "A property cannot depend on itself.": "プロパティは自分自身に依存できません。",
    "A regular expression the value must match.": "値が一致する必要がある正規表現です。",
    "Add Choice": "選択肢を追加",
    "Add Condition": "条件を追加",
    "Add Group": "グループを追加",
    "Add a property for each field users fill in.":
        "ユーザーが入力するフィールドごとにプロパティを追加してください。",
    "Add an element type": "要素タイプを追加",
    "Add an element type…": "要素タイプを追加…",
    "Add it": "追加",
    "Also set in the JSON: {keys}": "このほかに JSON で設定されているキー: {keys}",
    "Always written; users do not see the field.":
        "常に書き込まれます。このフィールドはユーザーには表示されません。",
    'Another property already has the id "{id}".':
        'ID "{id}" はすでに別のプロパティで使われています。',
    "Applies to": "適用対象",
    "Apply Template": "テンプレートを適用",
    "Attribute": "属性",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Java デリゲート、式、または外部タスクが実行する自動化された作業です",
    "Automated work carried out by a system": "システムが実行する自動化された作業です",
    "BPMN attribute": "BPMN 属性",
    "Basics": "基本情報",
    "Being edited in": "編集中:",
    "Called process": "呼び出されるプロセス",
    "Camunda properties, templates and lint": "Camunda のプロパティ、テンプレート、リント",
    "Checked by default.": "デフォルトでチェックされます。",
    "Child process": "子プロセス",
    "Choice name": "選択肢の名前",
    "Choice value": "選択肢の値",
    "Choices": "選択肢",
    "Choose a property": "プロパティを選択",
    "Clear search": "検索をクリア",
    "Close": "閉じる",
    "Collapse": "折りたたむ",
    "Create an element template": "要素テンプレートを作成",
    "Create template": "テンプレートを作成",
    "Creates element": "作成される要素",
    "Delegate": "Delegate",
    "Delete group": "グループを削除",
    "Delete property": "プロパティを削除",
    "Design": "デザイン",
    "Documentation link": "ドキュメントのリンク",
    "Duplicate property": "プロパティを複製",
    "Editable": "編集可能",
    "Element Templates": "要素テンプレート",
    "Element actions": "要素アクション",
    "Elements": "要素",
    "Engine": "エンジン",
    "Engine-neutral modeling": "エンジン非依存のモデリング",
    "Enter a number.": "数値を入力してください。",
    "Event definition": "イベント定義",
    "Expand": "展開",
    "Extension property": "拡張プロパティ",
    "Favourites": "お気に入り",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "JSON エディターで修正してください。修正されるまで、ビルダーは読み取り専用です。",
    "Fixed value": "固定値",
    "For example: Send mail": "例: メールを送信",
    "Groups": "グループ",
    "Groups put properties under their own heading in the properties panel.":
        "グループを使うと、プロパティパネルでプロパティを専用の見出しの下にまとめられます。",
    "Help text below the field.": "フィールドの下に表示されるヘルプテキストです。",
    "Hide preview": "プレビューを非表示",
    "Human": "人",
    "Implement": "実装",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "実装には Camunda 実行プラットフォームが必要ですが、このモデルにはありません。有効にするには割り当ててください。",
    "Is empty": "空である",
    "Is one of": "次のいずれか",
    "Is shown": "表示されている",
    "Java delegate": "Java デリゲート",
    "Leave the value out of the XML while it is empty.": "値が空のときは XML に書き込みません。",
    "Lets conditions refer to this property.": "条件からこのプロパティを参照できるようにします。",
    "Linked from the template in the properties panel.":
        "プロパティパネルのテンプレートにリンクとして表示されます。",
    "Maximum length": "最大文字数",
    "Message subscription": "メッセージサブスクリプション",
    "Minimum length": "最小文字数",
    "Mode": "モード",
    "Mode: {mode}": "モード: {mode}",
    "Move down": "下へ移動",
    "Move up": "上へ移動",
    "Name or code": "名前またはコード",
    "No FEEL": "FEEL なし",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'ID が "{id}" のグループはありません。プロパティは「カスタムプロパティ」の下に表示されます。',
    "No groups match your search.": "検索に一致するグループはありません。",
    "No groups yet.": "グループはまだありません。",
    "No matches in other models": "他のモデルに一致するものはありません",
    "No properties match your search.": "検索に一致するプロパティはありません。",
    "No properties yet.": "プロパティはまだありません。",
    'No property has the id "{id}".': 'ID が "{id}" のプロパティはありません。',
    "No settings match your search.": "検索に一致する設定はありません。",
    "No templates found": "テンプレートが見つかりません",
    "No value": "値なし",
    "No visible parameters": "表示可能なパラメータがありません",
    "None": "なし",
    "Operator": "演算子",
    "Optional": "任意",
    "Other": "その他",
    "Parts of the template": "テンプレートの各部分",
    "Pattern": "パターン",
    "Pattern message": "パターンのエラーメッセージ",
    "Pick the engine and the element the template is for. You can change both later.":
        "テンプレートの対象となるエンジンと要素を選択してください。どちらも後から変更できます。",
    "Placeholder": "プレースホルダー",
    "Placement": "配置",
    "Preview": "プレビュー",
    "Problems": "問題",
    "Properties join the group with this id.":
        "この ID を指定したプロパティがこのグループに入ります。",
    "Property": "プロパティ",
    "Raise it whenever you change a template that is in use.":
        "使用中のテンプレートを変更するたびに、バージョンを上げてください。",
    "Read-only": "読み取り専用",
    "Remove choice": "選択肢を削除",
    "Remove condition": "条件を削除",
    "Remove {value}": "{value} を削除",
    "Required": "必須",
    "Search failed": "検索に失敗しました",
    "Search groups": "グループを検索",
    "Search other models": "他のモデルを検索",
    "Search properties": "プロパティを検索",
    "Search template settings": "テンプレートの設定を検索",
    "Search templates...": "テンプレートを検索...",
    "Search...": "検索...",
    "Searching…": "検索中…",
    "Select a template to see its details": "詳細を表示するにはテンプレートを選択してください",
    "Show": "表示",
    "Show only when": "次の場合のみ表示",
    "Show preview": "プレビューを表示",
    "Shown above the field.": "フィールドの上に表示されます。",
    "Shown from the info icon next to the field.":
        "フィールドの横にある情報アイコンから表示されます。",
    "Shown in the empty field.": "空のフィールドに表示されます。",
    "Shown when the value does not match the pattern.":
        "値がパターンに一致しないときに表示されます。",
    "Shown when users pick a template.": "ユーザーがテンプレートを選択するときに表示されます。",
    "Shown with the name when users pick a template.":
        "ユーザーがテンプレートを選択するときに、名前と一緒に表示されます。",
    "Task Type": "タスクタイプ",
    "Task header": "タスクヘッダー",
    "The JSON is invalid: {message}": "JSON が無効です: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "ビルダーは {binding} バインディングの編集にまだ対応していません。このバインディングは JSON で編集してください。",
    "The builder opens once the file holds a valid element template.":
        "ファイルに有効な要素テンプレートが含まれると、ビルダーが開きます。",
    "The choice new elements start with.": "新しい要素で最初に選択されている選択肢です。",
    "The element it is applied to": "適用先の要素",
    "The elements users can apply the template to.": "ユーザーがテンプレートを適用できる要素です。",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'テンプレートで使えるバインディングはエンジンによって決まります。選択したエンジンはテンプレートの "$schema" として保存されます。',
    "The event definition the created event gets.":
        "作成されるイベントに設定されるイベント定義です。",
    "The fewest characters users may enter.": "ユーザーが入力できる最小の文字数です。",
    "The field shows only while all these conditions hold.":
        "これらの条件がすべて満たされている間だけ、フィールドが表示されます。",
    "The group the field appears in.": "フィールドが表示されるグループです。",
    "The group's heading in the properties panel.":
        "プロパティパネルに表示されるグループの見出しです。",
    "The kind of field users see.": "ユーザーに表示されるフィールドの種類です。",
    "The most characters users may enter.": "ユーザーが入力できる最大の文字数です。",
    "The options users pick from.": "ユーザーが選択できる選択肢です。",
    "The preview shows the last template without errors.":
        "プレビューには、エラーのない最後のテンプレートが表示されています。",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "プロパティパネルでの表示どおりのテンプレートです。ここで入力した値は保存されません。",
    'The template has no "$schema" that names its engine.':
        'テンプレートに、エンジンを示す "$schema" がありません。',
    "The value is FEEL": "値は FEEL 式",
    "The value is an expression.": "値は式です。",
    "The value must be one of the choices.": "値は選択肢のいずれかである必要があります。",
    "The value new elements start with.": "新しい要素の初期値です。",
    "This binding needs a zeebe:userTask property.":
        "このバインディングには zeebe:userTask プロパティが必要です。",
    "This binding needs one of the element types {types}.":
        "このバインディングには、要素タイプ {types} のいずれかが必要です。",
    "This binding needs the called process id.":
        "このバインディングには、呼び出されるプロセスの ID が必要です。",
    "This binding needs the decision id.": "このバインディングには決定 ID が必要です。",
    "This binding needs the element type {type}.":
        "このバインディングには要素タイプ {type} が必要です。",
    "This binding needs the result variable.": "このバインディングには結果変数が必要です。",
    "This binding needs the script expression.": "このバインディングにはスクリプトの式が必要です。",
    "This file does not contain an element template.":
        "このファイルには要素テンプレートが含まれていません。",
    "Tooltip": "ツールチップ",
    "Try a different search term": "別の検索語を試してください",
    "Turns the element into this type when the template is applied.":
        "テンプレートを適用すると、要素がこのタイプに変わります。",
    "Unique together with the version.": "バージョンとの組み合わせで一意である必要があります。",
    "Unlabeled property": "ラベルのないプロパティ",
    "Unnamed": "名前なし",
    "Unnamed group": "名前のないグループ",
    "Untitled template": "無題のテンプレート",
    "Users can change the value.": "ユーザーが値を変更できます。",
    "Users may enter FEEL": "ユーザーは FEEL を入力可能",
    "Users must fill in a value.": "ユーザーは値を入力する必要があります。",
    "View": "表示",
    "Where the value is written.": "値の書き込み先です。",
    "Whether users may or must enter a FEEL expression.":
        "ユーザーが FEEL 式を入力できるか、入力する必要があるかを指定します。",
    "Which engine is this template for?": "このテンプレートはどのエンジン用ですか？",
    "a, b, c": "a, b, c",
    "caught by {elements}": "キャッチ元: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "任意",
    "read-only": "読み取り専用",
    "required": "必須",
    "thrown by {elements}": "スロー元: {elements}",
    "{count} properties": "{count} 個のプロパティ",
    "{count} property": "{count} 個のプロパティ",
    "1 Error": "エラー 1 件",
    "1 Warning": "警告 1 件",
    "{count} Errors": "エラー {count} 件",
    "{count} Warnings": "警告 {count} 件",
    "{count} in {tab}": "{tab} に {count} 件",
    "{position} of {count}": "{position} / {count}",
    "{type}: no preview yet": "{type}: プレビューはまだありません",
    "A Hidden property should have a value.": "非表示のプロパティには値を設定してください。",
    "Activity": "アクティビティ",
    'Another group already has the id "{id}".': 'ID "{id}" はすでに別のグループで使われています。',
    "Edit in the JSON for now": "現時点では JSON で編集",
    "Enter an id.": "ID を入力してください。",
    "For other element types": "他の要素タイプ用",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "入力マッピングのオプションは非推奨です。Camunda 8.8 以降、空の入力マッピングは null になります。",
    "Remove FEEL": "FEEL を削除",
    "Remove Optional": "オプションを削除",
    "Set the element type to {type}": "要素タイプを {type} に設定",
    "Templates for {type} cannot be previewed yet.":
        "{type} のテンプレートはまだプレビューできません。",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "このバインディングは非推奨です。属性 type を持つタスク定義に置き換えてください。",
    "This binding only works on: {types}.":
        "このバインディングは次の要素でのみ機能します: {types}。",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "この変更は書き込まれませんでした。{path} 付近の JSON がビルダーの想定と異なります。JSON エディターで修正してください。",
    "Use the task definition": "タスク定義を使用",
    "Users cannot enter FEEL into a field they cannot edit.":
        "編集できないフィールドに FEEL は入力できません。",
    "Current": "現在",
    "Incoming": "入力側",
    "your branch": "自分のブランチ",
    "other branch": "相手のブランチ",
    "your commit": "自分のコミット",
    "your stash": "自分のスタッシュ",
    "Taken from this side": "この側から採用",
    "Taken from the other side": "反対側から採用",
    "Conflict": "競合",
    "Step through": "移動対象",
    "Open conflicts": "未解決の競合",
    "All merged elements": "マージされたすべての要素",
    "Without a shape": "形状なし",
    "No open conflicts": "未解決の競合はありません",
    "1 open conflict": "未解決の競合 1 件",
    "{count} open conflicts": "未解決の競合 {count} 件",
    "Keep this version": "このバージョンを保持",
    "Keep everything inside": "内部をすべて保持",
    "Undo pick": "選択を取り消す",
    "Your picks": "自分の選択",
    "Pulled in:": "追加:",
    "Dropped:": "除外:",
    "Open again:": "再び未解決:",
    "Keep current": "現在を保持",
    "Keep incoming": "入力側を保持",
    "C": "現",
    "I": "入",
    "Kept from current, your pick": "現在から保持 (自分の選択)",
    "Kept from incoming, your pick": "入力側から保持 (自分の選択)",
    "Kept from current with everything inside, your pick": "現在から内部ごと保持 (自分の選択)",
    "Kept from incoming with everything inside, your pick": "入力側から内部ごと保持 (自分の選択)",
    "Kept from current with its flows, your pick": "現在からフローごと保持 (自分の選択)",
    "Kept from incoming with its flows, your pick": "入力側からフローごと保持 (自分の選択)",
    "Kept from current: {element}": "現在から保持: {element}",
    "Kept from incoming: {element}": "入力側から保持: {element}",
    "{element} needs {target}, which no version has":
        "{element} には {target} が必要ですが、どのバージョンにもありません",
    "{element} needs {target}, which you picked from a side without it":
        "{element} には {target} が必要ですが、選択した側にはありません",
    "{element} needs {target}, which this pick drops":
        "{element} には {target} が必要ですが、この選択で除外されます",
    "{element} needs a part of {target} that this pick leaves out":
        "{element} には {target} の一部が必要ですが、この選択では含まれません",
    "{element} needs {target}, which this side does not have":
        "{element} には {target} が必要ですが、この側にはありません",
    "{element} needs {target}, which the result leaves out":
        "{element} には {target} が必要ですが、結果には含まれません",
    "{element} needs a part of {target} that the kept version lacks":
        "{element} には {target} の一部が必要ですが、保持したバージョンにはありません",
    "{element}, which you picked, needs {target}": "選択した {element} には {target} が必要です",
    "This pick brings in {element}, which needs {target}":
        "この選択で追加される {element} には {target} が必要です",
    "{element} and {target} hold the same id": "{element} と {target} の ID が同じです",
    "{element} and {target} each have a pool of the same process":
        "{element} と {target} はそれぞれ同じプロセスのプールを持っています",
    "{element} needs a part of {target}, which you picked from a side without it":
        "{element} には {target} の一部が必要ですが、選択した側にはありません",
    "{element} needs a part of {target} that this side does not have":
        "{element} には {target} の一部が必要ですが、この側にはありません",
    "Also keep the flow current removed with it": "現在が一緒に削除したフローも保持",
    "Also keep the {count} flows current removed with it":
        "現在が一緒に削除した {count} 個のフローも保持",
    "Also keep the flow incoming removed with it": "入力側が一緒に削除したフローも保持",
    "Also keep the {count} flows incoming removed with it":
        "入力側が一緒に削除した {count} 個のフローも保持",
    "Kept {element}": "{element} を保持しました",
    "Cannot keep {element}": "{element} を保持できません",
    "Left out {element}": "{element} を除外しました",
    "Cannot leave out {element}": "{element} を除外できません",
    "Took back the pick of {element}": "{element} の選択を取り消しました",
    "Cannot take back the pick of {element}": "{element} の選択を取り消せません",
    "Build": "生成",
    "Notes of the build": "生成の注意事項",
    "Compare with current": "現在と比較",
    "Compare with incoming": "入力側と比較",
    "Result against current": "結果と現在の比較",
    "Result against incoming": "結果と入力側の比較",
    "Result": "結果",
    "Review notes ({count})": "注意事項を確認 ({count})",
    "{element} connects shapes drawn by different sides; check where it meets {ends}":
        "{element} は異なる側が描いた形状をつないでいます。{ends} との接続箇所を確認してください",
    "{first} and {second} were added at the same place":
        "{first} と {second} が同じ位置に追加されました",
    "{element} is drawn by another side than {containers}; check that it still sits inside":
        "{element} は {containers} とは別の側が描いています。まだ内側にあるか確認してください",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} は、反対側が一緒に削除したフローなしで保持されています: {connections}",
    "The file's {attribute} differs between the sides; current's is kept":
        "ファイルの {attribute} が側によって異なります。現在の値を保持します",
    "1 conflict left": "残りの競合 1 件",
    "{count} conflicts left": "残りの競合 {count} 件",
};

export default dictionary;
