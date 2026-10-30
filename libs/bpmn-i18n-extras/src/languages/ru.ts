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
        "Связанная форма отсутствует или недействительна. Проверьте ссылку на форму.",
    "Preview linked form": "Просмотреть связанную форму",
    "Linked form preview": "Предпросмотр связанной формы",
    "Refresh": "Обновить",
    "Close form preview": "Закрыть предпросмотр формы",
    "Read-only preview of the saved local form.":
        "Предпросмотр сохранённой локальной формы только для чтения.",
    "Saved form loaded.": "Сохранённая форма загружена.",
    "Open a workspace folder to preview linked forms.":
        "Откройте папку рабочей области для предпросмотра связанных форм.",
    "No saved local form matches this reference. Refresh to try again.":
        "Сохранённая локальная форма по этой ссылке не найдена. Обновите для повторной попытки.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "По этой ссылке найдено несколько сохранённых форм. Выберите форму для предпросмотра.",
    "The saved form could not be read. Refresh to try again.":
        "Не удалось прочитать сохранённую форму. Обновите для повторной попытки.",
    "The host did not answer. Refresh to try again.":
        "Хост не ответил. Обновите для повторной попытки.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "Сохранённая форма недопустима или не поддерживается. Откройте её в редакторе форм.",
    "The form preview could not be loaded. Refresh to try again.":
        "Не удалось загрузить предпросмотр формы. Обновите для повторной попытки.",
    "Apply Template": "Применить шаблон",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Автоматизированная работа, выполняемая Java delegate, выражением или внешней задачей",
    "Automated work carried out by a system": "Автоматизированная работа, выполняемая системой",
    "Being edited in": "Редактируется в",
    "Camunda properties, templates and lint": "Свойства Camunda, шаблоны и линтинг",
    "Child process": "Дочерний процесс",
    "Clear search": "Очистить поиск",
    "Close": "Закрыть",
    "Collapse": "Свернуть",
    "Delegate": "Delegate",
    "Design": "Проектирование",
    "Element Templates": "Шаблоны элементов",
    "Element actions": "Действия элемента",
    "Engine-neutral modeling": "Моделирование без привязки к движку",
    "Expand": "Развернуть",
    "Favourites": "Избранное",
    "Human": "Человек",
    "Implement": "Реализация",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Для «Реализации» нужна платформа исполнения Camunda, но у этой модели её нет. Назначьте её, чтобы включить.",
    "Java delegate": "Java delegate",
    "Mode": "Режим",
    "Mode: {mode}": "Режим: {mode}",
    "Name or code": "Имя или код",
    "No matches in other models": "Нет совпадений в других моделях",
    "No templates found": "Шаблоны не найдены",
    "No visible parameters": "Нет видимых параметров",
    "Other": "Прочее",
    "Read-only": "Только чтение",
    "Search failed": "Ошибка поиска",
    "Search other models": "Искать в других моделях",
    "Search templates...": "Поиск шаблонов...",
    "Search...": "Поиск...",
    "Searching…": "Поиск…",
    "Select a template to see its details": "Выберите шаблон, чтобы увидеть его детали",
    "Task Type": "Тип задачи",
    "Try a different search term": "Попробуйте другой поисковый запрос",
    "Unnamed": "Без имени",
    "View": "Просмотр",
    "caught by {elements}": "перехватывает: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "необязательно",
    "read-only": "только для чтения",
    "required": "обязательно",
    "thrown by {elements}": "генерирует: {elements}",
    "{count} properties": "Свойств: {count}",
    "{count} property": "Свойств: {count}",
};

export default dictionary;
