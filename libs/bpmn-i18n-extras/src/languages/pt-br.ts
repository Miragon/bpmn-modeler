/*
 * Modeler-internal translation overlay — the strings the running modeler passes
 * to translate() that the shared @miragon/bpmn-modeler-i18n library does not
 * cover. Merged onto the shared dictionaries at startup via i18n.extend().
 * GENERATED from a runtime harvest — do not edit by hand; see tools/README.md.
 * The overlayScope test fails if the shared library ever ships one of these
 * keys; overlayNeeded fails if a key here is never requested at runtime.
 */
const dictionary: Record<string, string> = {
    "A form is either a form id or an external reference, not both.":
        "Um formulário usa um ID de formulário ou uma referência externa, não ambos.",
    "A property cannot depend on itself.": "Uma propriedade não pode depender de si mesma.",
    "A regular expression the value must match.":
        "Uma expressão regular à qual o valor deve corresponder.",
    "Add Choice": "Adicionar opção",
    "Add Condition": "Adicionar condição",
    "Add Group": "Adicionar grupo",
    "Add a property for each field users fill in.":
        "Adicione uma propriedade para cada campo que os usuários preenchem.",
    "Add an element type": "Adicionar um tipo de elemento",
    "Add an element type…": "Adicionar um tipo de elemento…",
    "Add it": "Adicionar",
    "Also set in the JSON: {keys}": "O JSON também define: {keys}",
    "Always written; users do not see the field.":
        "É sempre gravado; os usuários não veem o campo.",
    'Another property already has the id "{id}".': 'Outra propriedade já tem o ID "{id}".',
    "Applies to": "Aplica-se a",
    "Apply Template": "Aplicar modelo",
    "Attribute": "Atributo",
    "Automated work carried out by a Java delegate, expression, or external task":
        "Trabalho automatizado executado por um Java delegate, uma expressão ou uma tarefa externa",
    "Automated work carried out by a system": "Trabalho automatizado executado por um sistema",
    "BPMN attribute": "Atributo BPMN",
    "Basics": "Informações básicas",
    "Being edited in": "Sendo editado em",
    "Called process": "Processo chamado",
    "Camunda properties, templates and lint": "Propriedades do Camunda, modelos e linting",
    "Checked by default.": "Marcado por padrão.",
    "Child process": "Processo filho",
    "Choice name": "Nome da opção",
    "Choice value": "Valor da opção",
    "Choices": "Opções",
    "Choose a property": "Escolha uma propriedade",
    "Clear search": "Limpar pesquisa",
    "Close": "Fechar",
    "Collapse": "Recolher",
    "Create an element template": "Criar um modelo de elemento",
    "Create template": "Criar modelo",
    "Creates element": "Elemento resultante",
    "Delegate": "Delegate",
    "Delete group": "Excluir grupo",
    "Delete property": "Excluir propriedade",
    "Design": "Design",
    "Documentation link": "Link da documentação",
    "Duplicate property": "Duplicar propriedade",
    "Editable": "Editável",
    "Element Templates": "Modelos de elemento",
    "Element actions": "Ações do elemento",
    "Elements": "Elementos",
    "Engine": "Motor",
    "Engine-neutral modeling": "Modelagem independente do motor",
    "Enter a number.": "Digite um número.",
    "Event definition": "Definição de evento",
    "Expand": "Expandir",
    "Extension property": "Propriedade de extensão",
    "Favourites": "Favoritos",
    "Fix it in the JSON editor; until then the builder is read-only.":
        "Corrija-o no editor JSON; até lá, o editor visual fica em modo somente leitura.",
    "Fixed value": "Valor fixo",
    "For example: Send mail": "Por exemplo: Enviar e-mail",
    "Groups": "Grupos",
    "Groups put properties under their own heading in the properties panel.":
        "Os grupos reúnem as propriedades sob um título próprio no painel de propriedades.",
    "Help text below the field.": "Texto de ajuda abaixo do campo.",
    "Hide preview": "Ocultar pré-visualização",
    "Human": "Humano",
    "Implement": "Implementar",
    "Implement needs a Camunda execution platform — this model has none. Assign one to enable it.":
        "Implementar precisa de uma plataforma de execução Camunda; este modelo não tem nenhuma. Atribua uma para habilitá-la.",
    "Is empty": "Está vazio",
    "Is one of": "É um de",
    "Is shown": "Está visível",
    "Java delegate": "Java delegate",
    "Leave the value out of the XML while it is empty.":
        "Não gravar o valor no XML enquanto estiver vazio.",
    "Lets conditions refer to this property.":
        "Permite que as condições façam referência a esta propriedade.",
    "Linked from the template in the properties panel.":
        "Exibido como link do modelo no painel de propriedades.",
    "Maximum length": "Tamanho máximo",
    "Message subscription": "Assinatura de mensagem",
    "Minimum length": "Tamanho mínimo",
    "Mode": "Modo",
    "Mode: {mode}": "Modo: {mode}",
    "Move down": "Mover para baixo",
    "Move up": "Mover para cima",
    "Name or code": "Nome ou código",
    "No FEEL": "Sem FEEL",
    'No group has the id "{id}"; the property shows under "Custom properties".':
        'Nenhum grupo tem o ID "{id}"; a propriedade aparece em "Propriedades personalizadas".',
    "No groups match your search.": "Nenhum grupo corresponde à sua pesquisa.",
    "No groups yet.": "Ainda não há grupos.",
    "No matches in other models": "Nenhuma correspondência em outros modelos",
    "No properties match your search.": "Nenhuma propriedade corresponde à sua pesquisa.",
    "No properties yet.": "Ainda não há propriedades.",
    'No property has the id "{id}".': 'Nenhuma propriedade tem o ID "{id}".',
    "No settings match your search.": "Nenhuma configuração corresponde à sua pesquisa.",
    "No templates found": "Nenhum modelo encontrado",
    "No value": "Sem valor",
    "No visible parameters": "Nenhum parâmetro visível",
    "None": "Nenhuma",
    "Operator": "Operador",
    "Optional": "Opcional",
    "Other": "Outros",
    "Parts of the template": "Partes do modelo",
    "Pattern": "Padrão",
    "Pattern message": "Mensagem do padrão",
    "Pick the engine and the element the template is for. You can change both later.":
        "Escolha o motor e o elemento aos quais o modelo se destina. Você pode alterar ambos depois.",
    "Placeholder": "Espaço reservado",
    "Placement": "Posicionamento",
    "Preview": "Pré-visualização",
    "Problems": "Problemas",
    "Properties join the group with this id.": "As propriedades entram no grupo por meio deste ID.",
    "Property": "Propriedade",
    "Raise it whenever you change a template that is in use.":
        "Aumente-a sempre que alterar um modelo em uso.",
    "Read-only": "Somente leitura",
    "Remove choice": "Remover opção",
    "Remove condition": "Remover condição",
    "Remove {value}": "Remover {value}",
    "Required": "Obrigatório",
    "Search failed": "Falha na pesquisa",
    "Search groups": "Pesquisar grupos",
    "Search other models": "Pesquisar em outros modelos",
    "Search properties": "Pesquisar propriedades",
    "Search template settings": "Pesquisar configurações do modelo",
    "Search templates...": "Pesquisar modelos...",
    "Search...": "Pesquisar...",
    "Searching…": "Pesquisando…",
    "Select a template to see its details": "Selecione um modelo para ver seus detalhes",
    "Set the element type": "Definir o tipo de elemento",
    "Show": "Mostrar",
    "Show only when": "Mostrar somente quando",
    "Show preview": "Mostrar pré-visualização",
    "Shown above the field.": "Aparece acima do campo.",
    "Shown from the info icon next to the field.":
        "Aparece a partir do ícone de informações ao lado do campo.",
    "Shown in the empty field.": "Aparece no campo vazio.",
    "Shown when the value does not match the pattern.":
        "Aparece quando o valor não corresponde ao padrão.",
    "Shown when users pick a template.": "Aparece quando os usuários escolhem um modelo.",
    "Shown with the name when users pick a template.":
        "Aparece junto ao nome quando os usuários escolhem um modelo.",
    "Task Type": "Tipo de tarefa",
    "Task header": "Cabeçalho da atividade",
    "The JSON is invalid: {message}": "O JSON é inválido: {message}",
    "The builder does not edit {binding} bindings yet; edit this one in JSON.":
        "O editor visual ainda não edita vínculos do tipo {binding}; edite este no JSON.",
    "The builder opens once the file holds a valid element template.":
        "O editor visual será aberto assim que o arquivo contiver um modelo de elemento válido.",
    "The choice new elements start with.": "A opção inicial dos novos elementos.",
    "The element it is applied to": "O elemento ao qual é aplicado",
    "The elements users can apply the template to.":
        "Os elementos aos quais os usuários podem aplicar o modelo.",
    'The engine decides which bindings the template can use. Your choice is saved as its "$schema".':
        'O motor determina quais vínculos o modelo pode usar. Sua escolha é salva como o "$schema" do modelo.',
    "The event definition the created event gets.":
        "A definição de evento atribuída ao evento criado.",
    "The fewest characters users may enter.":
        "O número mínimo de caracteres que os usuários podem inserir.",
    "The field shows only while all these conditions hold.":
        "O campo só aparece enquanto todas estas condições forem atendidas.",
    "The group the field appears in.": "O grupo em que o campo aparece.",
    "The group's heading in the properties panel.": "O título do grupo no painel de propriedades.",
    "The kind of field users see.": "O tipo de campo que os usuários veem.",
    "The most characters users may enter.":
        "O número máximo de caracteres que os usuários podem inserir.",
    "The options users pick from.": "As opções entre as quais os usuários escolhem.",
    "The preview shows the last template without errors.":
        "A pré-visualização mostra o último estado sem erros do modelo.",
    "The template as the properties panel shows it. Values entered here are not saved.":
        "O modelo tal como o painel de propriedades o exibe. Os valores inseridos aqui não são salvos.",
    'The template has no "$schema" that names its engine.':
        'O modelo não tem um "$schema" que indique seu motor.',
    "The value is FEEL": "O valor é FEEL",
    "The value is an expression.": "O valor é uma expressão.",
    "The value must be one of the choices.": "O valor deve ser uma das opções.",
    "The value new elements start with.": "O valor inicial dos novos elementos.",
    "This binding needs a zeebe:userTask property.":
        "Este vínculo precisa de uma propriedade zeebe:userTask.",
    "This binding needs one of the element types {types}.":
        "Este vínculo precisa de um dos tipos de elemento {types}.",
    "This binding needs the called process id.": "Este vínculo precisa do ID do processo chamado.",
    "This binding needs the decision id.": "Este vínculo precisa do ID da decisão.",
    "This binding needs the element type {type}.":
        "Este vínculo precisa do tipo de elemento {type}.",
    "This binding needs the result variable.": "Este vínculo precisa da variável de resultado.",
    "This binding needs the script expression.": "Este vínculo precisa da expressão do script.",
    "This file does not contain an element template.":
        "Este arquivo não contém nenhum modelo de elemento.",
    "Tooltip": "Dica de ferramenta",
    "Try a different search term": "Tente um termo de pesquisa diferente",
    "Turns the element into this type when the template is applied.":
        "Converte o elemento neste tipo quando o modelo é aplicado.",
    "Unique together with the version.": "Único em conjunto com a versão.",
    "Unlabeled property": "Propriedade sem rótulo",
    "Unnamed": "Sem nome",
    "Unnamed group": "Grupo sem nome",
    "Untitled template": "Modelo sem título",
    "Users can change the value.": "Os usuários podem alterar o valor.",
    "Users may enter FEEL": "Os usuários podem inserir FEEL",
    "Users must fill in a value.": "Os usuários devem informar um valor.",
    "View": "Visualizar",
    "Where the value is written.": "Onde o valor é gravado.",
    "Whether users may or must enter a FEEL expression.":
        "Se os usuários podem ou devem inserir uma expressão FEEL.",
    "Which engine is this template for?": "Para qual motor é este modelo?",
    "a, b, c": "a, b, c",
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
