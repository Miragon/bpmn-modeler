/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Применить шаблон",
    "Being edited in": "Редактируется в",
    "Clear search": "Очистить поиск",
    "Close": "Закрыть",
    "Collapse": "Свернуть",
    "Delegate": "Delegate",
    "Design": "Проектирование",
    "Element Templates": "Шаблоны элементов",
    "Element actions": "Действия элемента",
    "Expand": "Развернуть",
    "Favourites": "Избранное",
    "Implement": "Реализация",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Для «Реализации» нужна платформа исполнения Camunda, но у этой модели её нет. Назначьте её, чтобы включить.",
    "Mode": "Режим",
    "No templates found": "Шаблоны не найдены",
    "No visible parameters": "Нет видимых параметров",
    "Other": "Прочее",
    "Read-only": "Только чтение",
    "Search templates...": "Поиск шаблонов...",
    "Search...": "Поиск...",
    "Select a template to see its details": "Выберите шаблон, чтобы увидеть его детали",
    "Task Type": "Тип задачи",
    "Try a different search term": "Попробуйте другой поисковый запрос",
    "Unnamed": "Без имени",
    "View": "Просмотр",
    "double": "double",
    "integer": "integer",
    "optional": "необязательно",
    "read-only": "только для чтения",
    "required": "обязательно",
    "{count} properties": "Свойств: {count}",
    "{mode} — open properties panel": "{mode} — открыть панель свойств",
};

export default dictionary;
