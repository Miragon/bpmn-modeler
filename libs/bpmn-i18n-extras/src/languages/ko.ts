/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "편집 중:",
    "Design": "디자인",
    "Element actions": "요소 작업",
    "Implement": "구현",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "구현하려면 Camunda 실행 플랫폼이 필요하지만 이 모델에는 없습니다. 사용하려면 하나를 지정하세요.",
    "Mode": "모드",
    "Read-only": "읽기 전용",
    "View": "보기",
    "{mode} — open properties panel": "{mode} — 속성 패널 열기",
};

export default dictionary;
