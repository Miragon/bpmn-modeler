/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "Preview linked form": "Visualizar formulário vinculado",
    "Linked form preview": "Prévia do formulário vinculado",
    "Refresh": "Atualizar",
    "Close form preview": "Fechar prévia do formulário",
    "Read-only preview of the saved local form.":
        "Prévia somente leitura do formulário local salvo.",
    "Saved form loaded.": "Formulário salvo carregado.",
    "Open a workspace folder to preview linked forms.":
        "Abra uma pasta de trabalho para visualizar formulários vinculados.",
    "No saved local form matches this reference. Refresh to try again.":
        "Nenhum formulário local salvo corresponde a esta referência. Atualize para tentar novamente.",
    "Multiple saved forms match this reference. Choose a form to preview.":
        "Vários formulários salvos correspondem a esta referência. Escolha um formulário para visualizar.",
    "The saved form could not be read. Refresh to try again.":
        "Não foi possível ler o formulário salvo. Atualize para tentar novamente.",
    "The host did not answer. Refresh to try again.":
        "O host não respondeu. Atualize para tentar novamente.",
    "The saved form is invalid or unsupported. Open it in the form editor.":
        "O formulário salvo é inválido ou não suportado. Abra-o no editor de formulários.",
    "The form preview could not be loaded. Refresh to try again.":
        "Não foi possível carregar a prévia do formulário. Atualize para tentar novamente.",
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
    "{count} property": "{count} propriedade",
};

export default dictionary;
