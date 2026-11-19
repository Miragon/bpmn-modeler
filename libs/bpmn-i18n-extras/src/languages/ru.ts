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
    "Fit diagram to view": "Вписать диаграмму в окно",
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
    "Changes": "Изменения",
    "No changes": "Нет изменений",
    "Show all": "Показать все",
    "Show XML changes": "Показать изменения XML",
    "Old version": "Старая версия",
    "New version": "Новая версия",
    "Not in this version": "Нет в этой версии",
    "It was removed. The version on the left shows it.":
        "Элемент удалён. Он показан в версии слева.",
    "It is new. The version on the right shows it.": "Элемент новый. Он показан в версии справа.",
    "A form is either a form id or an external reference, not both.":
        "Форма задаётся либо ID формы, либо внешней ссылкой, но не обоими сразу.",
    "A property cannot depend on itself.": "Свойство не может зависеть от самого себя.",
    "A regular expression the value must match.":
        "Регулярное выражение, которому должно соответствовать значение.",
    "Add Choice": "Добавить вариант",
    "Add Condition": "Добавить условие",
    "Add Group": "Добавить группу",
    "Add a property for each field users fill in.":
        "Добавьте свойство для каждого поля, которое заполняют пользователи.",
    "Add an element type": "Добавить тип элемента",
    "Add an element type…": "Добавить тип элемента…",
    "Add it": "Добавить",
    "Also set in the JSON: {keys}": "Также задано в JSON: {keys}",
    "Always written; users do not see the field.":
        "Записывается всегда; пользователи не видят это поле.",
    'Another property already has the id "{id}".': "ID «{id}» уже есть у другого свойства.",
    "Applies to": "Применяется к",
    "Apply Template": "Применить шаблон",
    "Attribute": "Атрибут",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Автоматизированная работа, выполняемая Java delegate, выражением или внешней задачей",
    "Automated work carried out by a system": "Автоматизированная работа, выполняемая системой",
    "BPMN attribute": "Атрибут BPMN",
    "Basics": "Основное",
    "Being edited in": "Редактируется в",
    "Called process": "Вызываемый процесс",
    "Camunda properties, templates and lint": "Свойства Camunda, шаблоны и линтинг",
    "Checked by default.": "По умолчанию отмечено.",
    "Child process": "Дочерний процесс",
    "Choice name": "Имя варианта",
    "Choice value": "Значение варианта",
    "Choices": "Варианты",
    "Choose a property": "Выберите свойство",
    "Clear search": "Очистить поиск",
    "Close": "Закрыть",
    "Collapse": "Свернуть",
    "Create an element template": "Создание шаблона элемента",
    "Create template": "Создать шаблон",
    "Creates element": "Создаваемый элемент",
    "Delegate": "Delegate",
    "Delete group": "Удалить группу",
    "Delete property": "Удалить свойство",
    "Design": "Проектирование",
    "Documentation link": "Ссылка на документацию",
    "Duplicate property": "Дублировать свойство",
    "Editable": "Можно изменять",
    "Element Templates": "Шаблоны элементов",
    "Element actions": "Действия элемента",
    "Elements": "Элементы",
    "Engine": "Движок",
    "Engine-neutral modeling": "Моделирование без привязки к движку",
    "Enter a number.": "Введите число.",
    "Event definition": "Определение события",
    "Expand": "Развернуть",
    "Extension property": "Свойство расширения",
    "Favourites": "Избранное",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Исправьте ошибку в редакторе JSON; до тех пор конструктор доступен только для чтения.",
    "Fixed value": "Фиксированное значение",
    "For example: Send mail": "Например: Отправить письмо",
    "Groups": "Группы",
    "Groups put properties under their own heading in the properties panel.":
        "Группы собирают свойства под отдельным заголовком на панели свойств.",
    "Help text below the field.": "Справочный текст под полем.",
    "Hide preview": "Скрыть предварительный просмотр",
    "Human": "Человек",
    "Implement": "Реализация",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Для «Реализации» нужна платформа исполнения Camunda, но у этой модели её нет. Назначьте её, чтобы включить.",
    "Is empty": "Пусто",
    "Is one of": "Одно из",
    "Is shown": "Отображается",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Не записывать значение в XML, пока оно пустое.",
    "Lets conditions refer to this property.": "Позволяет ссылаться на это свойство в условиях.",
    "Linked from the template in the properties panel.":
        "Ссылка, которую шаблон показывает на панели свойств.",
    "Maximum length": "Максимальная длина",
    "Message subscription": "Подписка на сообщение",
    "Minimum length": "Минимальная длина",
    "Mode": "Режим",
    "Mode: {mode}": "Режим: {mode}",
    "Move down": "Переместить вниз",
    "Move up": "Переместить вверх",
    "Name or code": "Имя или код",
    "No FEEL": "Без FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        "Нет группы с ID «{id}»; свойство отображается в разделе «Пользовательские свойства».",
    "No groups match your search.": "Нет групп, соответствующих запросу.",
    "No groups yet.": "Групп пока нет.",
    "No matches in other models": "Нет совпадений в других моделях",
    "No properties match your search.": "Нет свойств, соответствующих запросу.",
    "No properties yet.": "Свойств пока нет.",
    'No property has the id "{id}".': "Нет свойства с ID «{id}».",
    "No settings match your search.": "Нет настроек, соответствующих запросу.",
    "No templates found": "Шаблоны не найдены",
    "No value": "Без значения",
    "No visible parameters": "Нет видимых параметров",
    "None": "Нет",
    "Operator": "Оператор",
    "Optional": "Необязательно",
    "Other": "Прочее",
    "Parts of the template": "Части шаблона",
    "Pattern": "Образец",
    "Pattern message": "Сообщение об ошибке образца",
    "Pick the engine and the element the template is for. You can change both later.":
        "Выберите движок и элемент, для которых предназначен шаблон. Позже можно изменить и то, и другое.",
    "Placeholder": "Заполнитель",
    "Placement": "Размещение",
    "Preview": "Предварительный просмотр",
    "Problems": "Проблемы",
    "Properties join the group with this id.": "Свойства попадают в группу по этому ID.",
    "Property": "Свойство",
    "Raise it whenever you change a template that is in use.":
        "Увеличивайте её при каждом изменении шаблона, который уже используется.",
    "Read-only": "Только чтение",
    "Remove choice": "Удалить вариант",
    "Remove condition": "Удалить условие",
    "Remove {value}": "Удалить {value}",
    "Required": "Обязательно",
    "Search failed": "Ошибка поиска",
    "Search groups": "Поиск групп",
    "Search other models": "Искать в других моделях",
    "Search properties": "Поиск свойств",
    "Search template settings": "Поиск настроек шаблона",
    "Search templates...": "Поиск шаблонов...",
    "Search...": "Поиск...",
    "Searching…": "Поиск…",
    "Select a template to see its details": "Выберите шаблон, чтобы увидеть его детали",
    "Show": "Показать",
    "Show only when": "Показывать, только если",
    "Show preview": "Показать предварительный просмотр",
    "Shown above the field.": "Отображается над полем.",
    "Shown from the info icon next to the field.":
        "Отображается по значку информации рядом с полем.",
    "Shown in the empty field.": "Отображается в пустом поле.",
    "Shown when the value does not match the pattern.":
        "Отображается, когда значение не соответствует образцу.",
    "Shown when users pick a template.": "Отображается, когда пользователи выбирают шаблон.",
    "Shown with the name when users pick a template.":
        "Отображается вместе с именем, когда пользователи выбирают шаблон.",
    "Task Type": "Тип задачи",
    "Task header": "Заголовок задачи",
    "The JSON is invalid: {message}": "Недопустимый JSON: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "Конструктор пока не редактирует связи типа {binding}; измените эту связь в JSON.",
    "The builder opens once the file holds a valid element template.":
        "Конструктор откроется, когда в файле будет допустимый шаблон элемента.",
    "The choice new elements start with.": "Исходный вариант для новых элементов.",
    "The element it is applied to": "Элемент, к которому применяется шаблон",
    "The elements users can apply the template to.":
        "Элементы, к которым пользователи могут применить шаблон.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        "От движка зависит, какие связи может использовать шаблон. Выбор сохраняется в шаблоне как «$schema».",
    "The event definition the created event gets.":
        "Определение, которое получит создаваемое событие.",
    "The fewest characters users may enter.": "Наименьшее допустимое число символов.",
    "The field shows only while all these conditions hold.":
        "Поле отображается, только пока выполняются все эти условия.",
    "The group the field appears in.": "Группа, в которой отображается поле.",
    "The group's heading in the properties panel.": "Заголовок группы на панели свойств.",
    "The kind of field users see.": "Вид поля, которое видят пользователи.",
    "The most characters users may enter.": "Наибольшее допустимое число символов.",
    "The options users pick from.": "Варианты, из которых выбирают пользователи.",
    "The preview shows the last template without errors.":
        "В предварительном просмотре показан последний шаблон без ошибок.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "Шаблон в том виде, в каком его показывает панель свойств. Введённые здесь значения не сохраняются.",
    'The template has no "$schema" that names its engine.':
        "В шаблоне нет «$schema», указывающего его движок.",
    "The value is FEEL": "Значение — выражение FEEL",
    "The value is an expression.": "Значение является выражением.",
    "The value must be one of the choices.": "Значение должно быть одним из вариантов.",
    "The value new elements start with.": "Исходное значение для новых элементов.",
    "This binding needs a zeebe:userTask property.":
        "Для этой связи нужно свойство zeebe:userTask.",
    "This binding needs one of the element types {types}.":
        "Для этой связи нужен один из типов элементов: {types}.",
    "This binding needs the called process id.": "Для этой связи нужен ID вызываемого процесса.",
    "This binding needs the decision id.": "Для этой связи нужен ID решения.",
    "This binding needs the element type {type}.": "Для этой связи нужен тип элемента {type}.",
    "This binding needs the result variable.": "Для этой связи нужна переменная результата.",
    "This binding needs the script expression.": "Для этой связи нужно выражение скрипта.",
    "This file does not contain an element template.": "Этот файл не содержит шаблона элемента.",
    "Tooltip": "Подсказка",
    "Try a different search term": "Попробуйте другой поисковый запрос",
    "Turns the element into this type when the template is applied.":
        "При применении шаблона элемент получает этот тип.",
    "Unique together with the version.": "Должен быть уникальным в сочетании с версией.",
    "Unlabeled property": "Свойство без заголовка",
    "Unnamed": "Без имени",
    "Unnamed group": "Группа без имени",
    "Untitled template": "Шаблон без названия",
    "Users can change the value.": "Пользователи могут изменять значение.",
    "Users may enter FEEL": "Пользователи могут вводить FEEL",
    "Users must fill in a value.": "Пользователи должны ввести значение.",
    "View": "Просмотр",
    "Where the value is written.": "Куда записывается значение.",
    "Whether users may or must enter a FEEL expression.":
        "Могут ли пользователи вводить выражение FEEL или обязаны это делать.",
    "Which engine is this template for?": "Для какого движка этот шаблон?",
    "a, b, c": "a, b, c",
    "caught by {elements}": "перехватывает: {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "необязательно",
    "read-only": "только для чтения",
    "required": "обязательно",
    "thrown by {elements}": "генерирует: {elements}",
    "{count} properties": "Свойств: {count}",
    "{count} property": "Свойств: {count}",
    "1 Error": "1 ошибка",
    "1 Warning": "1 предупреждение",
    "{count} Errors": "Ошибок: {count}",
    "{count} Warnings": "Предупреждений: {count}",
    "{count} in {tab}": "{tab}: {count}",
    "{position} of {count}": "{position} из {count}",
    "{type}: no preview yet": "{type}: предварительного просмотра пока нет",
    "A Hidden property should have a value.": "У скрытого свойства должно быть значение.",
    "Activity": "Действие",
    'Another group already has the id "{id}".': "ID «{id}» уже есть у другой группы.",
    "Edit in the JSON for now": "Пока редактируется в JSON",
    "Enter an id.": "Введите ID.",
    "For other element types": "Для других типов элементов",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Необязательность сопоставления входных данных устарела; начиная с Camunda 8.8 пустое сопоставление равно null.",
    "Remove FEEL": "Убрать FEEL",
    "Remove Optional": "Убрать необязательность",
    "Set the element type to {type}": "Задать тип элемента {type}",
    "Templates for {type} cannot be previewed yet.": "Шаблоны для {type} пока нельзя просмотреть.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Эта связь устарела; её заменяет определение задачи с атрибутом type.",
    "This binding only works on: {types}.": "Эта связь работает только для: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Изменение не записано: JSON рядом с {path} не соответствует ожиданиям конструктора. Исправьте его в редакторе JSON.",
    "Use the task definition": "Использовать определение задачи",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Пользователи не могут вводить FEEL в поле, которое нельзя редактировать.",
    "Generate from name": "Создать из имени",
    "Review all IDs…": "Проверить все ID…",
    "Rename the ID to {id}": "Переименовать ID в {id}",
    "The ID already follows the name.": "ID уже соответствует имени.",
    "Add a name to generate the ID from it.": "Добавьте имя, чтобы создать из него ID.",
    "Current": "Текущее",
    "Incoming": "Входящее",
    "your branch": "ваша ветка",
    "other branch": "другая ветка",
    "your commit": "ваш коммит",
    "your stash": "ваш stash",
    "Taken from this side": "Взято с этой стороны",
    "Taken from the other side": "Взято с другой стороны",
    "Conflict": "Конфликт",
    "Step through": "Навигация",
    "Open conflicts": "Открытые конфликты",
    "All merged elements": "Все объединённые элементы",
    "No open conflicts": "Нет открытых конфликтов",
    "1 open conflict": "1 открытый конфликт",
    "{count} open conflicts": "Открытых конфликтов: {count}",
    "Keep everything inside": "Оставить всё содержимое",
    "Undo pick": "Отменить выбор",
    "Pulled in:": "Добавлено:",
    "Dropped:": "Исключено:",
    "Open again:": "Снова открыто:",
    "Keep current": "Оставить «Текущее»",
    "Keep incoming": "Оставить «Входящее»",
    "Kept from current, your pick": "Оставлено со стороны «Текущее», ваш выбор",
    "Kept from incoming, your pick": "Оставлено со стороны «Входящее», ваш выбор",
    "Kept from current with everything inside, your pick":
        "Оставлено со стороны «Текущее» со всем содержимым, ваш выбор",
    "Kept from incoming with everything inside, your pick":
        "Оставлено со стороны «Входящее» со всем содержимым, ваш выбор",
    "Kept from current with what was removed with it, your pick":
        "Оставлено со стороны «Текущее» вместе с тем, что удалено с ним, ваш выбор",
    "Kept from incoming with what was removed with it, your pick":
        "Оставлено со стороны «Входящее» вместе с тем, что удалено с ним, ваш выбор",
    "Kept from current: {element}": "Оставлено со стороны «Текущее»: {element}",
    "Kept from incoming: {element}": "Оставлено со стороны «Входящее»: {element}",
    "This pick brings in {element}, which needs {target}":
        "Этот выбор добавляет элемент {element}, которому требуется элемент {target}",
    "{element} and {target} hold the same ID": "У элементов {element} и {target} одинаковый ID",
    "Also keep the flow current removed with it":
        "Также оставить поток, удалённый вместе с ним стороной «Текущее»",
    "Also keep the {count} flows current removed with it":
        "Также оставить потоки ({count}), удалённые вместе с ним стороной «Текущее»",
    "Also keep the flow incoming removed with it":
        "Также оставить поток, удалённый вместе с ним стороной «Входящее»",
    "Also keep the {count} flows incoming removed with it":
        "Также оставить потоки ({count}), удалённые вместе с ним стороной «Входящее»",
    "Also keep the boundary event current removed with it":
        "Также оставить граничное событие, удалённое вместе с ним стороной «Текущее»",
    "Also keep the {count} elements current removed with it":
        "Также оставить элементы ({count}), удалённые вместе с ним стороной «Текущее»",
    "Also keep the boundary event incoming removed with it":
        "Также оставить граничное событие, удалённое вместе с ним стороной «Входящее»",
    "Also keep the {count} elements incoming removed with it":
        "Также оставить элементы ({count}), удалённые вместе с ним стороной «Входящее»",
    "Took back the pick of {element}": "Выбор отменён: {element}",
    "Build": "Собрать",
    "Notes of the build": "Примечания к сборке",
    "Compare with current": "Сравнить со стороной «Текущее»",
    "Compare with incoming": "Сравнить со стороной «Входящее»",
    "Result against current": "Результат и сторона «Текущее»",
    "Result against incoming": "Результат и сторона «Входящее»",
    "Result": "Результат",
    "Review notes ({count})": "Просмотреть примечания ({count})",
    "{element} does not meet {shapes}": "Элемент {element} не доходит до {shapes}",
    "{first} and {second} lie on top of each other":
        "Элементы {first} и {second} лежат друг на друге",
    "{element} runs through {shapes}": "Элемент {element} проходит через {shapes}",
    "{element} lies outside {shapes}": "Элемент {element} находится за пределами {shapes}",
    "{element} is not on the border of {host}": "Элемент {element} не находится на границе {host}",
    "{first} and {second} overlap": "Элементы {first} и {second} перекрываются",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "Элемент {element} оставлен без потоков, которые другая сторона удалила вместе с ним: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "Элемент {element} оставлен без граничного события, которое другая сторона удалила вместе с ним: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "Элемент {element} оставлен без элементов ({count}), которые другая сторона удалила вместе с ним: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "Поток {flow} оставлен, но больше не является потоком по умолчанию для {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "Поток {flow} оставлен, но потоком по умолчанию для {element} остаётся {keptDefault}",
    "The file's {attribute} differs between the sides; current's is kept":
        "Атрибут {attribute} файла различается между сторонами; сохраняется значение стороны «Текущее»",
    "1 conflict left": "Остался 1 конфликт",
    "{count} conflicts left": "Осталось конфликтов: {count}",
    "Elements of this version the result keeps as they are here.":
        "Элементы этой версии, которые результат оставляет в том виде, в каком они здесь.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Элементы этой версии, которые результат берёт из другой версии или исключает, так как другая версия их удалила.",
    "Open conflicts on elements this version has.":
        "Открытые конфликты в элементах, которые есть в этой версии.",
    "Elements only the other version has are counted on the other pane only.":
        "Элементы, которые есть только в другой версии, учитываются только на другой панели.",
    "More actions": "Другие действия",
    "This step has no shape, so it is listed here.":
        "У этого шага нет фигуры, поэтому он указан здесь.",
    "Not visible in the diagram ({count})": "Не видны на диаграмме ({count})",
    "1 open conflict not visible in the diagram": "1 открытый конфликт не виден на диаграмме",
    "{count} open conflicts not visible in the diagram":
        "Открытых конфликтов, не видимых на диаграмме: {count}",
    "Keep current with everything inside": "Оставить «Текущее» со всем содержимым",
    "Keep incoming with everything inside": "Оставить «Входящее» со всем содержимым",
    "Leave out": "Исключить",
    "Also keep what was removed with it": "Также оставить то, что удалено вместе с ним",
    "Keep it as current has it": "Оставить в том виде, как на стороне «Текущее»",
    "Keep it as incoming has it": "Оставить в том виде, как на стороне «Входящее»",
    "Keep it and everything inside as current has them":
        "Оставить вместе со всем содержимым в том виде, как на стороне «Текущее»",
    "Keep it and everything inside as incoming has them":
        "Оставить вместе со всем содержимым в том виде, как на стороне «Входящее»",
    "Keep it and every pool with its process as current has them":
        "Оставить вместе с каждым пулом и его процессом в том виде, как на стороне «Текущее»",
    "Keep it and every pool with its process as incoming has them":
        "Оставить вместе с каждым пулом и его процессом в том виде, как на стороне «Входящее»",
    "Leave it out, as current removed it": "Исключить, так как сторона «Текущее» его удалила",
    "Leave it out, as current doesn't have it": "Исключить, так как на стороне «Текущее» его нет",
    "Leave it out, as incoming removed it": "Исключить, так как сторона «Входящее» его удалила",
    "Leave it out, as incoming doesn't have it": "Исключить, так как на стороне «Входящее» его нет",
    "Go back to what the merge decided by itself": "Вернуться к тому, что слияние решило само",
    "none": "без значения",
    "and other content": "и другое содержимое",
    "Removed in current": "Удалено на стороне «Текущее»",
    "Not in current": "Нет на стороне «Текущее»",
    "Removed in incoming": "Удалено на стороне «Входящее»",
    "Not in incoming": "Нет на стороне «Входящее»",
    "Kept from current with everything inside: {element}":
        "Оставлено со стороны «Текущее» со всем содержимым: {element}",
    "Kept from incoming with everything inside: {element}":
        "Оставлено со стороны «Входящее» со всем содержимым: {element}",
    "Kept from current with what was removed with it: {element}":
        "Оставлено со стороны «Текущее» вместе с тем, что удалено с ним: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Оставлено со стороны «Входящее» вместе с тем, что удалено с ним: {element}",
    "Left out: {element}, as current removed it":
        "Исключено: {element}, так как сторона «Текущее» его удалила",
    "Left out: {element}, as current doesn't have it":
        "Исключено: {element}, так как на стороне «Текущее» его нет",
    "Left out: {element}, as incoming removed it":
        "Исключено: {element}, так как сторона «Входящее» его удалила",
    "Left out: {element}, as incoming doesn't have it":
        "Исключено: {element}, так как на стороне «Входящее» его нет",
    "Took back the pick. {element} is an open conflict again.":
        "Выбор отменён. {element} — снова открытый конфликт.",
    "Can't keep {element}": "Невозможно оставить: {element}",
    "Can't leave out {element}": "Невозможно исключить: {element}",
    "Can't take back the pick of {element}": "Невозможно отменить выбор: {element}",
    "Nothing blocks keeping {element} now": "Теперь ничто не мешает оставить элемент {element}",
    "Nothing blocks leaving out {element} now":
        "Теперь ничто не мешает исключить элемент {element}",
    "Nothing blocks taking back the pick of {element} now":
        "Теперь ничто не мешает отменить выбор элемента {element}",
    "{element} needs {target}; no version has it":
        "{element}: требуется элемент {target}, которого нет ни в одной версии",
    "{element} needs {target}; your pick takes a side without it":
        "{element}: требуется элемент {target}, а ваш выбор берёт сторону без него",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element}: требуется часть элемента {target}, а ваш выбор берёт сторону без неё",
    "{element} needs {target}; this pick drops it":
        "{element}: требуется элемент {target}, который этот выбор исключает",
    "{element} needs a part of {target} this pick leaves out":
        "{element}: требуется часть элемента {target}, которую этот выбор исключает",
    "{element} needs {target}; this side lacks it":
        "{element}: требуется элемент {target}, которого нет на этой стороне",
    "{element} needs a part of {target}; this side lacks it":
        "{element}: требуется часть элемента {target}, которой нет на этой стороне",
    "{element} needs {target}; the result leaves it out":
        "{element}: требуется элемент {target}, которого нет в результате",
    "{element} needs a part of {target} the kept version lacks":
        "{element}: требуется часть элемента {target}, которой нет в оставленной версии",
    "Your pick of {element} needs {target}":
        "Вашему выбору элемента {element} требуется элемент {target}",
    "{element} and {target} have a pool of the same process":
        "У элементов {element} и {target} есть пул одного и того же процесса",
    "{element} needs it; no version has it":
        "{element}: требуется этот элемент, которого нет ни в одной версии",
    "{element} needs it; your pick takes a side without it":
        "{element}: требуется этот элемент, а ваш выбор берёт сторону без него",
    "{element} needs a part of it; your pick takes a side without it":
        "{element}: требуется часть этого элемента, а ваш выбор берёт сторону без неё",
    "{element} needs it": "{element}: требуется этот элемент",
    "{element} needs a part of it this pick leaves out":
        "{element}: требуется часть этого элемента, которую этот выбор исключает",
    "{element} needs it; this side lacks it":
        "{element}: требуется этот элемент, которого нет на этой стороне",
    "{element} needs a part of it; this side lacks it":
        "{element}: требуется часть этого элемента, которой нет на этой стороне",
    "{element} needs a part of it the kept version lacks":
        "{element}: требуется часть этого элемента, которой нет в оставленной версии",
    "Your pick of {element} needs it": "Вашему выбору элемента {element} требуется этот элемент",
    "This pick brings in {element}, which needs it":
        "Этот выбор добавляет элемент {element}, которому требуется этот элемент",
    "{element} holds the same ID": "У элемента {element} такой же ID",
    "{element} has a pool of the same process": "У элемента {element} есть пул того же процесса",
    "and {count} more": "и ещё {count}",
    "Data store": "Хранилище данных",
    "Item definition": "Определение элемента",
    "Category": "Категория",
    "Interface": "Интерфейс",
    "End point": "Конечная точка",
    "Partner entity": "Сущность партнёра",
    "Partner role": "Роль партнёра",
    "Correlation property": "Свойство корреляции",
    "Global task": "Глобальная задача",
    "Flow from {source} to {target}": "Поток {source} → {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Обе стороны изменили расположение элементов {elements}; сохраняется расположение стороны «Текущее»",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Обе стороны изменили расположение элементов {elements}; сохраняется расположение стороны «Входящее»",
};

export default dictionary;
