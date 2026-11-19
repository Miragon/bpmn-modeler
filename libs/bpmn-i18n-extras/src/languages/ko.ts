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
        "연결된 양식이 없거나 유효하지 않습니다. 양식 참조를 확인하세요.",
    "Preview linked form": "연결된 양식 미리보기",
    "Fit diagram to view": "다이어그램을 화면에 맞추기",
    "Linked form preview": "연결된 양식 미리보기",
    "Refresh": "새로 고침",
    "Close form preview": "양식 미리보기 닫기",
    "Read-only preview of the saved local form.": "저장된 로컬 양식의 읽기 전용 미리보기입니다.",
    "Saved form loaded.": "저장된 양식을 불러왔습니다.",
    "Open a workspace folder to preview linked forms.":
        "연결된 양식을 미리 보려면 작업 영역 폴더를 여세요.",
    "No saved local form matches this reference. Refresh to try again.":
        "이 참조와 일치하는 저장된 로컬 양식이 없습니다. 새로 고침하여 다시 시도하세요.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "이 참조와 일치하는 저장된 양식이 여러 개입니다. 미리 볼 양식을 선택하세요.",
    "The saved form could not be read. Refresh to try again.":
        "저장된 양식을 읽을 수 없습니다. 새로 고침하여 다시 시도하세요.",
    "The host did not answer. Refresh to try again.":
        "호스트가 응답하지 않았습니다. 새로 고침하여 다시 시도하세요.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "저장된 양식이 유효하지 않거나 지원되지 않습니다. 양식 편집기에서 여세요.",
    "The form preview could not be loaded. Refresh to try again.":
        "양식 미리보기를 불러올 수 없습니다. 새로 고침하여 다시 시도하세요.",
    "Changes": "변경 사항",
    "No changes": "변경 사항 없음",
    "Show all": "모두 표시",
    "Show XML changes": "XML 변경 사항 표시",
    "Old version": "이전 버전",
    "New version": "새 버전",
    "Not in this version": "이 버전에 없음",
    "It was removed. The version on the left shows it.": "제거되었습니다. 왼쪽 버전에 표시됩니다.",
    "It is new. The version on the right shows it.":
        "새로 추가되었습니다. 오른쪽 버전에 표시됩니다.",
    "A form is either a form id or an external reference, not both.":
        "양식에는 양식 ID와 외부 참조 중 하나만 지정할 수 있습니다.",
    "A property cannot depend on itself.": "속성은 자기 자신에 종속될 수 없습니다.",
    "A regular expression the value must match.": "값이 일치해야 하는 정규식입니다.",
    "Add Choice": "선택 항목 추가",
    "Add Condition": "조건 추가",
    "Add Group": "그룹 추가",
    "Add a property for each field users fill in.":
        "사용자가 입력하는 필드마다 속성을 추가하십시오.",
    "Add an element type": "요소 유형 추가",
    "Add an element type…": "요소 유형 추가…",
    "Add it": "추가",
    "Also set in the JSON: {keys}": "JSON에 추가로 설정된 키: {keys}",
    "Always written; users do not see the field.":
        "항상 기록됩니다. 사용자에게는 이 필드가 표시되지 않습니다.",
    'Another property already has the id "{id}".':
        'ID "{id}"은(는) 이미 다른 속성에서 사용 중입니다.',
    "Applies to": "적용 대상",
    "Apply Template": "템플릿 적용",
    "Attribute": "특성",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Java 델리게이트, 표현식 또는 외부 작업이 수행하는 자동화된 작업입니다",
    "Automated work carried out by a system": "시스템이 수행하는 자동화된 작업입니다",
    "BPMN attribute": "BPMN 특성",
    "Basics": "기본 정보",
    "Being edited in": "편집 중:",
    "Called process": "호출된 프로세스",
    "Camunda properties, templates and lint": "Camunda 속성, 템플릿 및 린트",
    "Checked by default.": "기본적으로 선택되어 있습니다.",
    "Child process": "자식 프로세스",
    "Choice name": "선택 항목 이름",
    "Choice value": "선택 항목 값",
    "Choices": "선택 항목",
    "Choose a property": "속성 선택",
    "Clear search": "검색 지우기",
    "Close": "닫기",
    "Collapse": "접기",
    "Create an element template": "요소 템플릿 생성",
    "Create template": "템플릿 생성",
    "Creates element": "생성되는 요소",
    "Delegate": "Delegate",
    "Delete group": "그룹 삭제",
    "Delete property": "속성 삭제",
    "Design": "디자인",
    "Documentation link": "문서 링크",
    "Duplicate property": "속성 복제",
    "Editable": "편집 가능",
    "Element Templates": "요소 템플릿",
    "Element actions": "요소 작업",
    "Elements": "요소",
    "Engine": "엔진",
    "Engine-neutral modeling": "엔진 중립적 모델링",
    "Enter a number.": "숫자를 입력하십시오.",
    "Event definition": "이벤트 정의",
    "Expand": "펼치기",
    "Extension property": "확장 속성",
    "Favourites": "즐겨찾기",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "JSON 편집기에서 수정하십시오. 그때까지 빌더는 읽기 전용입니다.",
    "Fixed value": "고정값",
    "For example: Send mail": "예: 메일 보내기",
    "Groups": "그룹",
    "Groups put properties under their own heading in the properties panel.":
        "그룹을 사용하면 속성 패널에서 속성을 별도의 제목 아래에 모을 수 있습니다.",
    "Help text below the field.": "필드 아래에 표시되는 도움말 텍스트입니다.",
    "Hide preview": "미리 보기 숨기기",
    "Human": "사람",
    "Implement": "구현",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "구현하려면 Camunda 실행 플랫폼이 필요하지만 이 모델에는 없습니다. 사용하려면 하나를 지정하세요.",
    "Is empty": "비어 있음",
    "Is one of": "다음 중 하나",
    "Is shown": "표시됨",
    "Java delegate": "Java 델리게이트",
    "Leave the value out of the XML while it is empty.":
        "값이 비어 있으면 XML에 포함하지 않습니다.",
    "Lets conditions refer to this property.": "조건에서 이 속성을 참조할 수 있게 합니다.",
    "Linked from the template in the properties panel.":
        "속성 패널에서 템플릿의 링크로 표시됩니다.",
    "Maximum length": "최대 길이",
    "Message subscription": "메시지 구독",
    "Minimum length": "최소 길이",
    "Mode": "모드",
    "Mode: {mode}": "모드: {mode}",
    "Move down": "아래로 이동",
    "Move up": "위로 이동",
    "Name or code": "이름 또는 코드",
    "No FEEL": "FEEL 없음",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'ID가 "{id}"인 그룹이 없습니다. 속성은 "사용자 정의 속성" 아래에 표시됩니다.',
    "No groups match your search.": "검색과 일치하는 그룹이 없습니다.",
    "No groups yet.": "아직 그룹이 없습니다.",
    "No matches in other models": "다른 모델에 일치 항목 없음",
    "No properties match your search.": "검색과 일치하는 속성이 없습니다.",
    "No properties yet.": "아직 속성이 없습니다.",
    'No property has the id "{id}".': 'ID가 "{id}"인 속성이 없습니다.',
    "No settings match your search.": "검색과 일치하는 설정이 없습니다.",
    "No templates found": "템플릿을 찾을 수 없음",
    "No value": "값 없음",
    "No visible parameters": "표시할 매개변수 없음",
    "None": "없음",
    "Operator": "연산자",
    "Optional": "선택 사항",
    "Other": "기타",
    "Parts of the template": "템플릿의 각 부분",
    "Pattern": "패턴",
    "Pattern message": "패턴 오류 메시지",
    "Pick the engine and the element the template is for. You can change both later.":
        "템플릿에 사용할 엔진과 요소를 선택하십시오. 둘 다 나중에 변경할 수 있습니다.",
    "Placeholder": "자리 표시자",
    "Placement": "배치",
    "Preview": "미리 보기",
    "Problems": "문제",
    "Properties join the group with this id.": "이 ID를 지정한 속성이 이 그룹에 포함됩니다.",
    "Property": "속성",
    "Raise it whenever you change a template that is in use.":
        "사용 중인 템플릿을 변경할 때마다 버전을 올리십시오.",
    "Read-only": "읽기 전용",
    "Remove choice": "선택 항목 제거",
    "Remove condition": "조건 제거",
    "Remove {value}": "{value} 제거",
    "Required": "필수",
    "Search failed": "검색 실패",
    "Search groups": "그룹 검색",
    "Search other models": "다른 모델 검색",
    "Search properties": "속성 검색",
    "Search template settings": "템플릿 설정 검색",
    "Search templates...": "템플릿 검색...",
    "Search...": "검색...",
    "Searching…": "검색 중…",
    "Select a template to see its details": "세부 정보를 보려면 템플릿을 선택하세요",
    "Show": "표시",
    "Show only when": "다음 경우에만 표시",
    "Show preview": "미리 보기 표시",
    "Shown above the field.": "필드 위에 표시됩니다.",
    "Shown from the info icon next to the field.": "필드 옆의 정보 아이콘을 통해 표시됩니다.",
    "Shown in the empty field.": "빈 필드에 표시됩니다.",
    "Shown when the value does not match the pattern.": "값이 패턴과 일치하지 않을 때 표시됩니다.",
    "Shown when users pick a template.": "사용자가 템플릿을 선택할 때 표시됩니다.",
    "Shown with the name when users pick a template.":
        "사용자가 템플릿을 선택할 때 이름과 함께 표시됩니다.",
    "Task Type": "작업 유형",
    "Task header": "작업 헤더",
    "The JSON is invalid: {message}": "JSON이 유효하지 않습니다: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "빌더에서는 아직 {binding} 바인딩을 편집할 수 없습니다. 이 바인딩은 JSON에서 편집하십시오.",
    "The builder opens once the file holds a valid element template.":
        "파일에 유효한 요소 템플릿이 있으면 빌더가 열립니다.",
    "The choice new elements start with.": "새 요소에서 처음 선택되어 있는 항목입니다.",
    "The element it is applied to": "템플릿이 적용되는 요소",
    "The elements users can apply the template to.": "사용자가 템플릿을 적용할 수 있는 요소입니다.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        '템플릿에서 사용할 수 있는 바인딩은 엔진에 따라 결정됩니다. 선택한 엔진은 템플릿의 "$schema"로 저장됩니다.',
    "The event definition the created event gets.": "생성되는 이벤트에 지정되는 이벤트 정의입니다.",
    "The fewest characters users may enter.": "사용자가 입력할 수 있는 최소 문자 수입니다.",
    "The field shows only while all these conditions hold.":
        "이 조건을 모두 충족하는 동안에만 필드가 표시됩니다.",
    "The group the field appears in.": "필드가 표시되는 그룹입니다.",
    "The group's heading in the properties panel.": "속성 패널에 표시되는 그룹 제목입니다.",
    "The kind of field users see.": "사용자에게 표시되는 필드의 종류입니다.",
    "The most characters users may enter.": "사용자가 입력할 수 있는 최대 문자 수입니다.",
    "The options users pick from.": "사용자가 선택할 수 있는 항목입니다.",
    "The preview shows the last template without errors.":
        "미리 보기에는 오류가 없는 마지막 템플릿이 표시됩니다.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "속성 패널에 표시되는 그대로의 템플릿입니다. 여기에 입력한 값은 저장되지 않습니다.",
    'The template has no "$schema" that names its engine.':
        '템플릿에 엔진을 지정하는 "$schema"가 없습니다.',
    "The value is FEEL": "값이 FEEL 표현식임",
    "The value is an expression.": "값이 표현식입니다.",
    "The value must be one of the choices.": "값은 선택 항목 중 하나여야 합니다.",
    "The value new elements start with.": "새 요소의 초기값입니다.",
    "This binding needs a zeebe:userTask property.":
        "이 바인딩에는 zeebe:userTask 속성이 필요합니다.",
    "This binding needs one of the element types {types}.":
        "이 바인딩에는 요소 유형 {types} 중 하나가 필요합니다.",
    "This binding needs the called process id.": "이 바인딩에는 호출된 프로세스 ID가 필요합니다.",
    "This binding needs the decision id.": "이 바인딩에는 결정 ID가 필요합니다.",
    "This binding needs the element type {type}.":
        "이 바인딩에는 요소 유형 {type}이(가) 필요합니다.",
    "This binding needs the result variable.": "이 바인딩에는 결과 변수가 필요합니다.",
    "This binding needs the script expression.": "이 바인딩에는 스크립트 표현식이 필요합니다.",
    "This file does not contain an element template.": "이 파일에는 요소 템플릿이 없습니다.",
    "Tooltip": "도구 설명",
    "Try a different search term": "다른 검색어를 시도해 보세요",
    "Turns the element into this type when the template is applied.":
        "템플릿을 적용하면 요소가 이 유형으로 바뀝니다.",
    "Unique together with the version.": "버전과 함께 고유해야 합니다.",
    "Unlabeled property": "레이블 없는 속성",
    "Unnamed": "이름 없음",
    "Unnamed group": "이름 없는 그룹",
    "Untitled template": "제목 없는 템플릿",
    "Users can change the value.": "사용자가 값을 변경할 수 있습니다.",
    "Users may enter FEEL": "사용자가 FEEL 입력 가능",
    "Users must fill in a value.": "사용자가 값을 반드시 입력해야 합니다.",
    "View": "보기",
    "Where the value is written.": "값이 기록되는 위치입니다.",
    "Whether users may or must enter a FEEL expression.":
        "사용자가 FEEL 표현식을 입력할 수 있는지, 반드시 입력해야 하는지 지정합니다.",
    "Which engine is this template for?": "이 템플릿은 어떤 엔진용입니까?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "포착: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "선택 사항",
    "read-only": "읽기 전용",
    "required": "필수",
    "thrown by {elements}": "발생: {elements}",
    "{count} properties": "{count}개 속성",
    "{count} property": "{count}개 속성",
    "1 Error": "오류 1개",
    "1 Warning": "경고 1개",
    "{count} Errors": "오류 {count}개",
    "{count} Warnings": "경고 {count}개",
    "{count} in {tab}": "{tab}에 {count}개",
    "{position} of {count}": "{position} / {count}",
    "{type}: no preview yet": "{type}: 아직 미리 보기 없음",
    "A Hidden property should have a value.": "숨겨진 속성에는 값이 있어야 합니다.",
    "Activity": "액티비티",
    'Another group already has the id "{id}".': 'ID "{id}"은(는) 이미 다른 그룹에서 사용 중입니다.',
    "Edit in the JSON for now": "현재는 JSON에서 편집",
    "Enter an id.": "ID를 입력하십시오.",
    "For other element types": "다른 요소 유형용",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "입력 매핑의 선택 사항은 더 이상 사용되지 않습니다. Camunda 8.8부터 빈 입력 매핑은 null입니다.",
    "Remove FEEL": "FEEL 제거",
    "Remove Optional": "선택 사항 제거",
    "Set the element type to {type}": "요소 유형을 {type}(으)로 설정",
    "Templates for {type} cannot be previewed yet.": "{type} 템플릿은 아직 미리 볼 수 없습니다.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "이 바인딩은 더 이상 사용되지 않습니다. type 특성이 있는 작업 정의로 대체됩니다.",
    "This binding only works on: {types}.": "이 바인딩은 다음에서만 작동합니다: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "이 변경 내용은 기록되지 않았습니다. {path} 주변의 JSON이 빌더가 예상한 형식이 아닙니다. JSON 편집기에서 수정하십시오.",
    "Use the task definition": "작업 정의 사용",
    "Users cannot enter FEEL into a field they cannot edit.":
        "사용자는 편집할 수 없는 필드에 FEEL을 입력할 수 없습니다.",
    "Generate from name": "이름으로 생성",
    "Review all IDs…": "모든 ID 검토…",
    "Rename the ID to {id}": "ID를 {id}(으)로 변경",
    "The ID already follows the name.": "ID가 이미 이름과 일치합니다.",
    "Add a name to generate the ID from it.":
        "이름을 추가하면 그 이름으로 ID를 생성할 수 있습니다.",
    "Current": "현재",
    "Incoming": "수신",
    "your branch": "내 브랜치",
    "other branch": "다른 브랜치",
    "your commit": "내 커밋",
    "your stash": "내 스태시",
    "Taken from this side": "이쪽에서 가져옴",
    "Taken from the other side": "다른 쪽에서 가져옴",
    "Conflict": "충돌",
    "Step through": "이동 대상",
    "Open conflicts": "미해결 충돌",
    "All merged elements": "병합된 모든 요소",
    "No open conflicts": "미해결 충돌 없음",
    "1 open conflict": "미해결 충돌 1개",
    "{count} open conflicts": "미해결 충돌 {count}개",
    "Keep everything inside": "내부 전체 유지",
    "Undo pick": "선택 취소",
    "Pulled in:": "추가됨:",
    "Dropped:": "제외됨:",
    "Open again:": "다시 미해결:",
    "Keep current": "현재 유지",
    "Keep incoming": "수신 유지",
    "Kept from current, your pick": "현재에서 유지, 내 선택",
    "Kept from incoming, your pick": "수신에서 유지, 내 선택",
    "Kept from current with everything inside, your pick":
        "현재에서 내부 전체와 함께 유지, 내 선택",
    "Kept from incoming with everything inside, your pick":
        "수신에서 내부 전체와 함께 유지, 내 선택",
    "Kept from current with what was removed with it, your pick":
        "현재에서 함께 제거된 항목과 함께 유지, 내 선택",
    "Kept from incoming with what was removed with it, your pick":
        "수신에서 함께 제거된 항목과 함께 유지, 내 선택",
    "Kept from current: {element}": "현재에서 유지: {element}",
    "Kept from incoming: {element}": "수신에서 유지: {element}",
    "This pick brings in {element}, which needs {target}":
        "이 선택으로 추가되는 {element}에 {target}이(가) 필요합니다",
    "{element} and {target} hold the same ID": "{element}와(과) {target}의 ID가 같습니다",
    "Also keep the flow current removed with it": "현재가 함께 제거한 흐름도 유지",
    "Also keep the {count} flows current removed with it":
        "현재가 함께 제거한 흐름 {count}개도 유지",
    "Also keep the flow incoming removed with it": "수신이 함께 제거한 흐름도 유지",
    "Also keep the {count} flows incoming removed with it":
        "수신이 함께 제거한 흐름 {count}개도 유지",
    "Also keep the boundary event current removed with it": "현재가 함께 제거한 경계 이벤트도 유지",
    "Also keep the {count} elements current removed with it":
        "현재가 함께 제거한 요소 {count}개도 유지",
    "Also keep the boundary event incoming removed with it":
        "수신이 함께 제거한 경계 이벤트도 유지",
    "Also keep the {count} elements incoming removed with it":
        "수신이 함께 제거한 요소 {count}개도 유지",
    "Took back the pick of {element}": "{element} 선택 취소됨",
    "Build": "생성",
    "Notes of the build": "생성 참고 사항",
    "Compare with current": "현재와 비교",
    "Compare with incoming": "수신과 비교",
    "Result against current": "결과 대 현재",
    "Result against incoming": "결과 대 수신",
    "Result": "결과",
    "Review notes ({count})": "참고 사항 검토 ({count})",
    "The build moved {element} to meet {shapes}":
        "생성 시 {element}을(를) {shapes}에 닿도록 옮겼습니다",
    "{element} does not meet {shapes}; the build could not repair it":
        "{element}이(가) {shapes}에 닿지 않습니다. 생성 시 고칠 수 없었습니다",
    "The build moved {element} off {shapes}":
        "생성 시 {element}을(를) {shapes}에서 떨어지도록 옮겼습니다",
    "The build moved {element} off {shapes} and made room by shifting {shifted}":
        "생성 시 {element}을(를) {shapes}에서 떨어지도록 옮기고 {shifted}을(를) 밀어 자리를 만들었습니다",
    "The build moved {element} off {shapes} and grew {grown} to hold it":
        "생성 시 {element}을(를) {shapes}에서 떨어지도록 옮기고 들어가도록 {grown}을(를) 넓혔습니다",
    "The build moved {element} off {shapes}, grew {grown} to hold it and shifted {shifted}":
        "생성 시 {element}을(를) {shapes}에서 떨어지도록 옮기고 들어가도록 {grown}을(를) 넓히고 {shifted}을(를) 밀었습니다",
    "{first} and {second} lie on top of each other; the build could not repair it":
        "{first}와(과) {second}이(가) 서로 겹쳐 놓여 있습니다. 생성 시 고칠 수 없었습니다",
    "The build moved {element} around {shapes}":
        "생성 시 {element}을(를) {shapes}을(를) 피해 옮겼습니다",
    "{element} runs through {shapes}; the build could not repair it":
        "{element}이(가) {shapes}을(를) 통과합니다. 생성 시 고칠 수 없었습니다",
    "The build moved {element} into {shapes}": "생성 시 {element}을(를) {shapes} 안으로 옮겼습니다",
    "The build grew {shapes} to hold {element}":
        "생성 시 {element}이(가) 들어가도록 {shapes}을(를) 넓혔습니다",
    "The build grew {shapes} to hold {element} and shifted {shifted}":
        "생성 시 {element}이(가) 들어가도록 {shapes}을(를) 넓히고 {shifted}을(를) 밀었습니다",
    "{element} lies outside {shapes}; the build could not repair it":
        "{element}이(가) {shapes} 밖에 있습니다. 생성 시 고칠 수 없었습니다",
    "{element} is not on the border of {host}":
        "{element}이(가) {host}의 테두리 위에 있지 않습니다",
    "The build moved {element} below the other lanes and grew {grown} to hold it":
        "생성 시 {element}을(를) 다른 레인 아래로 옮기고 들어가도록 {grown}을(를) 넓혔습니다",
    "The build moved {element} below the other lanes, grew {grown} to hold it and shifted {shifted}":
        "생성 시 {element}을(를) 다른 레인 아래로 옮기고 들어가도록 {grown}을(를) 넓히고 {shifted}을(를) 밀었습니다",
    "{first} and {second} overlap; the build could not repair it":
        "{first}와(과) {second}이(가) 겹칩니다. 생성 시 고칠 수 없었습니다",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element}은(는) 다른 쪽이 함께 제거한 흐름 없이 유지됩니다: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element}은(는) 다른 쪽이 함께 제거한 경계 이벤트 없이 유지됩니다: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element}은(는) 다른 쪽이 함께 제거한 요소 {count}개 없이 유지됩니다: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow}은(는) 유지되지만 더 이상 {element}의 기본 흐름이 아닙니다",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow}은(는) 유지되지만 {element}의 기본 흐름은 {keptDefault}(으)로 유지됩니다",
    "The file's {attribute} differs between the sides; current's is kept":
        "파일의 {attribute}이(가) 양쪽에서 다릅니다. 현재의 값이 유지됩니다",
    "{element} is left out of the drawing: no diagram shows both {source} and {target}":
        "{element}은(는) 그려지지 않습니다. {source}와(과) {target}을(를) 함께 표시하는 다이어그램이 없습니다",
    "{element} is left out of the drawing: it lacks a source or a target":
        "{element}은(는) 그려지지 않습니다. 소스 또는 대상이 없습니다",
    "1 conflict left": "남은 충돌 1개",
    "{count} conflicts left": "남은 충돌 {count}개",
    "Elements of this version the result keeps as they are here.":
        "결과가 여기 있는 그대로 유지하는 이 버전의 요소입니다.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "결과가 다른 버전에서 가져오거나, 다른 버전이 제거하여 제외하는 이 버전의 요소입니다.",
    "Open conflicts on elements this version has.": "이 버전에 있는 요소의 미해결 충돌입니다.",
    "Elements only the other version has are counted on the other pane only.":
        "다른 버전에만 있는 요소는 다른 창에서만 집계됩니다.",
    "More actions": "추가 작업",
    "This step has no shape, so it is listed here.": "이 단계에는 도형이 없어 여기에 표시됩니다.",
    "Not visible in the diagram ({count})": "다이어그램에 표시되지 않음 ({count})",
    "1 open conflict not visible in the diagram": "다이어그램에 표시되지 않는 미해결 충돌 1개",
    "{count} open conflicts not visible in the diagram":
        "다이어그램에 표시되지 않는 미해결 충돌 {count}개",
    "Keep current with everything inside": "현재를 내부 전체와 함께 유지",
    "Keep incoming with everything inside": "수신을 내부 전체와 함께 유지",
    "Leave out": "제외",
    "Also keep what was removed with it": "함께 제거된 항목도 유지",
    "Keep it as current has it": "현재에 있는 그대로 유지",
    "Keep it as incoming has it": "수신에 있는 그대로 유지",
    "Keep it and everything inside as current has them": "내부 전체와 함께 현재에 있는 그대로 유지",
    "Keep it and everything inside as incoming has them":
        "내부 전체와 함께 수신에 있는 그대로 유지",
    "Keep it and every pool with its process as current has them":
        "모든 풀과 해당 프로세스와 함께 현재에 있는 그대로 유지",
    "Keep it and every pool with its process as incoming has them":
        "모든 풀과 해당 프로세스와 함께 수신에 있는 그대로 유지",
    "Leave it out, as current removed it": "현재에서 제거되었으므로 제외",
    "Leave it out, as current doesn't have it": "현재에 없으므로 제외",
    "Leave it out, as incoming removed it": "수신에서 제거되었으므로 제외",
    "Leave it out, as incoming doesn't have it": "수신에 없으므로 제외",
    "Go back to what the merge decided by itself": "병합이 자동으로 결정한 상태로 되돌리기",
    "none": "값 없음",
    "and other content": "및 기타 내용",
    "Removed in current": "현재에서 제거됨",
    "Not in current": "현재에 없음",
    "Removed in incoming": "수신에서 제거됨",
    "Not in incoming": "수신에 없음",
    "Kept from current with everything inside: {element}":
        "현재에서 내부 전체와 함께 유지: {element}",
    "Kept from incoming with everything inside: {element}":
        "수신에서 내부 전체와 함께 유지: {element}",
    "Kept from current with what was removed with it: {element}":
        "현재에서 함께 제거된 항목과 함께 유지: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "수신에서 함께 제거된 항목과 함께 유지: {element}",
    "Left out: {element}, as current removed it": "제외됨: {element} (현재에서 제거됨)",
    "Left out: {element}, as current doesn't have it": "제외됨: {element} (현재에 없음)",
    "Left out: {element}, as incoming removed it": "제외됨: {element} (수신에서 제거됨)",
    "Left out: {element}, as incoming doesn't have it": "제외됨: {element} (수신에 없음)",
    "Took back the pick. {element} is an open conflict again.":
        "선택을 취소했습니다. {element}은(는) 다시 미해결 충돌입니다.",
    "Can't keep {element}": "{element}을(를) 유지할 수 없음",
    "Can't leave out {element}": "{element}을(를) 제외할 수 없음",
    "Can't take back the pick of {element}": "{element} 선택을 취소할 수 없음",
    "Nothing blocks keeping {element} now": "이제 {element}을(를) 유지할 수 있습니다",
    "Nothing blocks leaving out {element} now": "이제 {element}을(를) 제외할 수 있습니다",
    "Nothing blocks taking back the pick of {element} now":
        "이제 {element} 선택을 취소할 수 있습니다",
    "{element} needs {target}; no version has it":
        "{element}에 필요한 {target}이(가) 어느 버전에도 없습니다",
    "{element} needs {target}; your pick takes a side without it":
        "{element}에 필요한 {target}이(가) 선택한 쪽에 없습니다",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element}에 필요한 {target}의 일부가 선택한 쪽에 없습니다",
    "{element} needs {target}; this pick drops it":
        "{element}에 필요한 {target}을(를) 이 선택이 제외합니다",
    "{element} needs a part of {target} this pick leaves out":
        "{element}에 필요한 {target}의 일부를 이 선택이 제외합니다",
    "{element} needs {target}; this side lacks it":
        "{element}에 필요한 {target}이(가) 이쪽에 없습니다",
    "{element} needs a part of {target}; this side lacks it":
        "{element}에 필요한 {target}의 일부가 이쪽에 없습니다",
    "{element} needs {target}; the result leaves it out":
        "{element}에 필요한 {target}이(가) 결과에서 제외됩니다",
    "{element} needs a part of {target} the kept version lacks":
        "{element}에 필요한 {target}의 일부가 유지한 버전에 없습니다",
    "Your pick of {element} needs {target}": "{element} 선택에 {target}이(가) 필요합니다",
    "{element} and {target} have a pool of the same process":
        "{element}와(과) {target}에 같은 프로세스의 풀이 있습니다",
    "{element} needs it; no version has it": "{element}에 필요하지만 어느 버전에도 없습니다",
    "{element} needs it; your pick takes a side without it":
        "{element}에 필요하지만 선택한 쪽에 없습니다",
    "{element} needs a part of it; your pick takes a side without it":
        "{element}에 필요한 일부가 선택한 쪽에 없습니다",
    "{element} needs it": "{element}에 필요합니다",
    "{element} needs a part of it this pick leaves out":
        "{element}에 필요한 일부를 이 선택이 제외합니다",
    "{element} needs it; this side lacks it": "{element}에 필요하지만 이쪽에 없습니다",
    "{element} needs a part of it; this side lacks it": "{element}에 필요한 일부가 이쪽에 없습니다",
    "{element} needs a part of it the kept version lacks":
        "{element}에 필요한 일부가 유지한 버전에 없습니다",
    "Your pick of {element} needs it": "{element} 선택에 필요합니다",
    "This pick brings in {element}, which needs it": "이 선택으로 추가되는 {element}에 필요합니다",
    "{element} holds the same ID": "{element}와(과) ID가 같습니다",
    "{element} has a pool of the same process": "{element}에 같은 프로세스의 풀이 있습니다",
    "and {count} more": "외 {count}개",
    "Data store": "데이터 저장소",
    "Item definition": "항목 정의",
    "Category": "카테고리",
    "Interface": "인터페이스",
    "End point": "엔드포인트",
    "Partner entity": "파트너 엔터티",
    "Partner role": "파트너 역할",
    "Correlation property": "상관 속성",
    "Global task": "전역 작업",
    "Flow from {source} to {target}": "{source}에서 {target}(으)로 가는 흐름",
    "Both sides changed the layout of {elements}; current's is kept":
        "양쪽이 {elements}의 레이아웃을 변경했습니다. 현재의 레이아웃이 유지됩니다",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "양쪽이 {elements}의 레이아웃을 변경했습니다. 수신의 레이아웃이 유지됩니다",
    "by hand": "수동",
    "Edit again": "다시 편집",
    "Keep my XML": "내 XML 유지",
    "Keep the XML merged before": "이전에 병합한 XML 유지",
    "Merge XML": "XML 병합",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "양쪽의 XML 변경 사항을 병합 편집기에서 수동으로 병합합니다",
    "Edit merged XML": "병합한 XML 편집",
    "Change the XML you merged by hand": "수동으로 병합한 XML을 변경합니다",
    "Keep current's version": "현재 버전 유지",
    "Keep incoming's version": "수신 버전 유지",
    "Drop it and pick": "버리고 선택",
    "Drop it and leave out": "버리고 제외",
    "Drop it and undo": "버리고 취소",
    "Kept from current and merged by hand, your pick": "현재에서 유지하고 수동으로 병합, 내 선택",
    "Kept from incoming and merged by hand, your pick": "수신에서 유지하고 수동으로 병합, 내 선택",
    "Kept from current with everything inside and merged by hand, your pick":
        "현재에서 내부 전체와 함께 유지하고 수동으로 병합, 내 선택",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "수신에서 내부 전체와 함께 유지하고 수동으로 병합, 내 선택",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "현재에서 함께 제거된 항목과 함께 유지하고 수동으로 병합, 내 선택",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "수신에서 함께 제거된 항목과 함께 유지하고 수동으로 병합, 내 선택",
    "Merged by hand: {element}": "수동으로 병합됨: {element}",
    "Closed without saving: {element} is unchanged":
        "저장하지 않고 닫음: {element}은(는) 변경되지 않음",
    "This drops the XML you merged by hand for {elements}":
        "{elements}에 대해 수동으로 병합한 XML이 버려집니다",
    "The XML of {element} still holds conflict markers": "{element}의 XML에 아직 충돌 표시가 있음",
    "The XML of {element} doesn't parse": "{element}의 XML을 구문 분석할 수 없음",
    "The XML of {element} must hold one element": "{element}의 XML에는 요소가 하나만 있어야 함",
    "The XML of {element} changes its type": "{element}의 XML이 형식을 변경함",
    "The XML of {element} changes its ID": "{element}의 XML이 ID를 변경함",
    "The XML of {element} holds elements of their own": "{element}의 XML에 독립된 요소가 있음",
    "The XML of {element} goes beyond its own content": "{element}의 XML이 자체 내용을 벗어남",
    "The XML of {element} names an element of the wrong type":
        "{element}의 XML이 잘못된 형식의 요소를 지정함",
    "The XML of {element} uses an unknown namespace":
        "{element}의 XML이 알 수 없는 네임스페이스를 사용함",
    "The engine doesn't take the XML of {element}": "엔진이 {element}의 XML을 받아들이지 않음",
    "The XML of {element} changes what follows the pick":
        "{element}의 XML이 선택을 따르는 항목을 변경함",
    "The XML of {element} names an element no version has":
        "{element}의 XML이 어떤 버전에도 없는 요소를 지정함",
    "The XML of {element} names an element the result leaves out":
        "{element}의 XML이 결과에서 제외되는 요소를 지정함",
    "The XML of {element} would change other decisions": "{element}의 XML이 다른 결정을 변경함",
    "The pick of {element} changed while you merged it": "병합하는 동안 {element}의 선택이 변경됨",
    "Resolve each conflict and remove its markers, then save.":
        "각 충돌을 해결하고 표시를 제거한 다음 저장하세요.",
    "The parser says: {detail}": "파서 메시지: {detail}",
    "It holds {count} elements at its top level.": "최상위에 요소가 {count}개 있습니다.",
    "It is a {found} now; keep it a {expected}.":
        "지금은 {found}입니다. {expected}(으)로 유지하세요.",
    "Its ID is {found} now; keep {expected}.":
        "ID가 지금은 {found}입니다. {expected}을(를) 유지하세요.",
    "It has no ID now; keep {expected}.": "지금은 ID가 없습니다. {expected}을(를) 유지하세요.",
    "Merge these on their own, with a pick: {elements}":
        "이 항목은 선택으로 따로 병합하세요: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "여기서는 특성, 문서, 확장 요소만 병합되며 {properties}은(는) 병합되지 않습니다.",
    "{target} as {property}, which takes a {expected}":
        "{property}(으)로서의 {target}, {expected}이(가) 필요함",
    "No version declares {namespaces}.": "{namespaces}을(를) 선언하는 버전이 없습니다.",
    "The engine says: {detail}": "엔진 메시지: {detail}",
    "{properties} follow the side you picked.": "{properties}은(는) 선택한 쪽을 따릅니다.",
    "No version has {elements}.": "{elements}이(가) 있는 버전이 없습니다.",
    "The result leaves out {elements}.": "결과에서 {elements}이(가) 제외됩니다.",
    "It would change the decisions on {elements}.": "{elements}에 대한 결정이 변경됩니다.",
    "It is no longer picked on the side you merged it for.":
        "병합한 쪽에서 더 이상 선택되어 있지 않습니다.",
};

export default dictionary;
