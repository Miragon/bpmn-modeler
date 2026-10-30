/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Preview linked form": "연결된 양식 미리보기",
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
    "Apply Template": "템플릿 적용",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Java 델리게이트, 표현식 또는 외부 작업이 수행하는 자동화된 작업입니다",
    "Automated work carried out by a system": "시스템이 수행하는 자동화된 작업입니다",
    "Being edited in": "편집 중:",
    "Camunda properties, templates and lint": "Camunda 속성, 템플릿 및 린트",
    "Child process": "자식 프로세스",
    "Clear search": "검색 지우기",
    "Close": "닫기",
    "Collapse": "접기",
    "Delegate": "Delegate",
    "Design": "디자인",
    "Element Templates": "요소 템플릿",
    "Element actions": "요소 작업",
    "Engine-neutral modeling": "엔진 중립적 모델링",
    "Expand": "펼치기",
    "Favourites": "즐겨찾기",
    "Human": "사람",
    "Implement": "구현",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "구현하려면 Camunda 실행 플랫폼이 필요하지만 이 모델에는 없습니다. 사용하려면 하나를 지정하세요.",
    "Java delegate": "Java 델리게이트",
    "Mode": "모드",
    "Mode: {mode}": "모드: {mode}",
    "Name or code": "이름 또는 코드",
    "No matches in other models": "다른 모델에 일치 항목 없음",
    "No templates found": "템플릿을 찾을 수 없음",
    "No visible parameters": "표시할 매개변수 없음",
    "Other": "기타",
    "Read-only": "읽기 전용",
    "Search failed": "검색 실패",
    "Search other models": "다른 모델 검색",
    "Search templates...": "템플릿 검색...",
    "Search...": "검색...",
    "Searching…": "검색 중…",
    "Select a template to see its details": "세부 정보를 보려면 템플릿을 선택하세요",
    "Task Type": "작업 유형",
    "Try a different search term": "다른 검색어를 시도해 보세요",
    "Unnamed": "이름 없음",
    "View": "보기",
    "caught by {elements}": "포착: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "선택 사항",
    "read-only": "읽기 전용",
    "required": "필수",
    "thrown by {elements}": "발생: {elements}",
    "{count} properties": "{count}개 속성",
    "{count} property": "{count}개 속성",
};

export default dictionary;
