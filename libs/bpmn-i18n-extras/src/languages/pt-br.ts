/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Apply Template": "Aplicar modelo",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Trabalho automatizado executado por um Java delegate, uma expressão ou uma tarefa externa",
    "Automated work carried out by a system": "Trabalho automatizado executado por um sistema",
    "Being edited in": "Sendo editado em",
    "Camunda properties, templates and lint": "Propriedades do Camunda, modelos e linting",
    "Child process": "Processo filho",
    "Clear search": "Limpar pesquisa",
    "Close": "Fechar",
    "Collapse": "Recolher",
    "Delegate": "Delegate",
    "Design": "Design",
    "Element Templates": "Modelos de elemento",
    "Element actions": "Ações do elemento",
    "Engine-neutral modeling": "Modelagem independente do motor",
    "Expand": "Expandir",
    "Favourites": "Favoritos",
    "Human": "Humano",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar precisa de uma plataforma de execução Camunda; este modelo não tem nenhuma. Atribua uma para habilitá-la.",
    "Java delegate": "Java delegate",
    "Mode": "Modo",
    "Mode: {mode}": "Modo: {mode}",
    "Name or code": "Nome ou código",
    "No matches in other models": "Nenhuma correspondência em outros modelos",
    "No templates found": "Nenhum modelo encontrado",
    "No visible parameters": "Nenhum parâmetro visível",
    "Other": "Outros",
    "Read-only": "Somente leitura",
    "Search failed": "Falha na pesquisa",
    "Search other models": "Pesquisar em outros modelos",
    "Search templates...": "Pesquisar modelos...",
    "Search...": "Pesquisar...",
    "Searching…": "Pesquisando…",
    "Select a template to see its details": "Selecione um modelo para ver seus detalhes",
    "Task Type": "Tipo de tarefa",
    "Try a different search term": "Tente um termo de pesquisa diferente",
    "Unnamed": "Sem nome",
    "View": "Visualizar",
    "caught by {elements}": "capturado por {elements}",
    "double": "double",
    "integer": "integer",
    "optional": "opcional",
    "read-only": "somente leitura",
    "required": "obrigatório",
    "thrown by {elements}": "lançado por {elements}",
    "{count} properties": "{count} propriedades",
};

export default dictionary;
