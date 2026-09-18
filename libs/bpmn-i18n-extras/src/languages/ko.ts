/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "템플릿 적용",
    "Being edited in": "편집 중:",
    "Clear search": "검색 지우기",
    "Close": "닫기",
    "Collapse": "접기",
    "Delegate": "Delegate",
    "Design": "디자인",
    "Element Templates": "요소 템플릿",
    "Element actions": "요소 작업",
    "Expand": "펼치기",
    "Favourites": "즐겨찾기",
    "Implement": "구현",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "구현하려면 Camunda 실행 플랫폼이 필요하지만 이 모델에는 없습니다. 사용하려면 하나를 지정하세요.",
    "Mode": "모드",
    "No templates found": "템플릿을 찾을 수 없음",
    "No visible parameters": "표시할 매개변수 없음",
    "Other": "기타",
    "Read-only": "읽기 전용",
    "Search templates...": "템플릿 검색...",
    "Search...": "검색...",
    "Select a template to see its details": "세부 정보를 보려면 템플릿을 선택하세요",
    "Task Type": "작업 유형",
    "Try a different search term": "다른 검색어를 시도해 보세요",
    "Unnamed": "이름 없음",
    "View": "보기",
    "double": "double",
    "integer": "integer",
    "optional": "선택 사항",
    "read-only": "읽기 전용",
    "required": "필수",
    "{count} properties": "{count}개 속성",
    "{mode} — open properties panel": "{mode} — 속성 패널 열기",
};

export default dictionary;
