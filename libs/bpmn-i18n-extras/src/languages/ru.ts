/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Being edited in": "Редактируется в",
    "Design": "Проектирование",
    "Element actions": "Действия элемента",
    "Implement": "Реализация",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Для «Реализации» нужна платформа исполнения Camunda, но у этой модели её нет. Назначьте её, чтобы включить.",
    "Mode": "Режим",
    "Read-only": "Только чтение",
    "View": "Просмотр",
    "{mode} — open properties panel": "{mode} — открыть панель свойств",
};

export default dictionary;
