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
    "Being edited in": "Sendo editado em",
    "Clear search": "Limpar pesquisa",
    "Close": "Fechar",
    "Collapse": "Recolher",
    "Delegate": "Delegate",
    "Design": "Design",
    "Element Templates": "Modelos de elemento",
    "Element actions": "Ações do elemento",
    "Expand": "Expandir",
    "Favourites": "Favoritos",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar precisa de uma plataforma de execução Camunda; este modelo não tem nenhuma. Atribua uma para habilitá-la.",
    "Mode": "Modo",
    "No templates found": "Nenhum modelo encontrado",
    "No visible parameters": "Nenhum parâmetro visível",
    "Other": "Outros",
    "Read-only": "Somente leitura",
    "Search templates...": "Pesquisar modelos...",
    "Search...": "Pesquisar...",
    "Select a template to see its details": "Selecione um modelo para ver seus detalhes",
    "Task Type": "Tipo de tarefa",
    "Try a different search term": "Tente um termo de pesquisa diferente",
    "Unnamed": "Sem nome",
    "View": "Visualizar",
    "double": "double",
    "integer": "integer",
    "optional": "opcional",
    "read-only": "somente leitura",
    "required": "obrigatório",
    "{count} properties": "{count} propriedades",
    "{mode} — open properties panel": "{mode} — abrir o painel de propriedades",
};

export default dictionary;
