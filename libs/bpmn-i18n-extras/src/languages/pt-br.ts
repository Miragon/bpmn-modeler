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
        "O formulário vinculado está ausente ou é inválido. Verifique a referência ao formulário.",
    "Preview linked form": "Visualizar formulário vinculado",
    "Fit diagram to view": "Ajustar o diagrama à visualização",
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
    "Changes": "Alterações",
    "No changes": "Nenhuma alteração",
    "Show all": "Mostrar tudo",
    "Show XML changes": "Mostrar alterações no XML",
    "Old version": "Versão antiga",
    "New version": "Versão nova",
    "Not in this version": "Não está nesta versão",
    "It was removed. The version on the left shows it.":
        "Foi removido. A versão à esquerda o mostra.",
    "It is new. The version on the right shows it.": "É novo. A versão à direita o mostra.",
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
    "1 Error": "1 erro",
    "1 Warning": "1 aviso",
    "{count} Errors": "{count} erros",
    "{count} Warnings": "{count} avisos",
    "{count} in {tab}": "{count} em {tab}",
    "{position} of {count}": "{position} de {count}",
    "{type}: no preview yet": "{type}: ainda sem pré-visualização",
    "A Hidden property should have a value.": "Uma propriedade oculta deve ter um valor.",
    "Activity": "Atividade",
    'Another group already has the id "{id}".': 'Outro grupo já tem o ID "{id}".',
    "Edit in the JSON for now": "Por enquanto, edite no JSON",
    "Enter an id.": "Digite um ID.",
    "For other element types": "Para outros tipos de elemento",
    "Optional on an input mapping is deprecated; from Camunda 8.8 an empty input mapping is null.":
        "Opcional em um mapeamento de entrada está obsoleto; a partir do Camunda 8.8, um mapeamento de entrada vazio é null.",
    "Remove FEEL": "Remover FEEL",
    "Remove Optional": "Remover Opcional",
    "Set the element type to {type}": "Definir o tipo de elemento como {type}",
    "Templates for {type} cannot be previewed yet.":
        "Os modelos para {type} ainda não podem ser pré-visualizados.",
    "This binding is deprecated; a task definition with the attribute type replaces it.":
        "Este vínculo está obsoleto; uma definição de tarefa com o atributo type o substitui.",
    "This binding only works on: {types}.": "Este vínculo só funciona em: {types}.",
    "This change was not written: the JSON around {path} is not what the builder expects. Fix it in the JSON editor.":
        "Esta alteração não foi gravada: o JSON em torno de {path} não é o que o editor visual espera. Corrija-o no editor JSON.",
    "Use the task definition": "Usar a definição de tarefa",
    "Users cannot enter FEEL into a field they cannot edit.":
        "Os usuários não podem inserir FEEL em um campo que não podem editar.",
    "Generate from name": "Gerar a partir do nome",
    "Review all IDs…": "Revisar todos os IDs…",
    "Rename the ID to {id}": "Renomear o ID para {id}",
    "The ID already follows the name.": "O ID já segue o nome.",
    "Add a name to generate the ID from it.": "Adicione um nome para gerar o ID a partir dele.",
    "Current": "Atual",
    "Incoming": "Entrada",
    "your branch": "seu branch",
    "other branch": "outro branch",
    "your commit": "seu commit",
    "your stash": "seu stash",
    "Taken from this side": "Tomado deste lado",
    "Taken from the other side": "Tomado do outro lado",
    "Conflict": "Conflito",
    "Step through": "Percorrer",
    "Open conflicts": "Conflitos abertos",
    "All merged elements": "Todos os elementos mesclados",
    "No open conflicts": "Nenhum conflito aberto",
    "1 open conflict": "1 conflito aberto",
    "{count} open conflicts": "{count} conflitos abertos",
    "Keep everything inside": "Manter todo o conteúdo",
    "Undo pick": "Desfazer escolha",
    "Pulled in:": "Incluído:",
    "Dropped:": "Descartado:",
    "Open again:": "Aberto novamente:",
    "Keep current": "Manter Atual",
    "Keep incoming": "Manter Entrada",
    "Kept from current, your pick": "Mantido de Atual, sua escolha",
    "Kept from incoming, your pick": "Mantido de Entrada, sua escolha",
    "Kept from current with everything inside, your pick":
        "Mantido de Atual com todo o conteúdo, sua escolha",
    "Kept from incoming with everything inside, your pick":
        "Mantido de Entrada com todo o conteúdo, sua escolha",
    "Kept from current with what was removed with it, your pick":
        "Mantido de Atual com o que foi removido com ele, sua escolha",
    "Kept from incoming with what was removed with it, your pick":
        "Mantido de Entrada com o que foi removido com ele, sua escolha",
    "Kept from current: {element}": "Mantido de Atual: {element}",
    "Kept from incoming: {element}": "Mantido de Entrada: {element}",
    "This pick brings in {element}, which needs {target}":
        "Esta escolha inclui {element}, que precisa de {target}",
    "{element} and {target} hold the same ID": "{element} e {target} têm o mesmo ID",
    "Also keep the flow current removed with it": "Manter também o fluxo que Atual removeu com ele",
    "Also keep the {count} flows current removed with it":
        "Manter também os {count} fluxos que Atual removeu com ele",
    "Also keep the flow incoming removed with it":
        "Manter também o fluxo que Entrada removeu com ele",
    "Also keep the {count} flows incoming removed with it":
        "Manter também os {count} fluxos que Entrada removeu com ele",
    "Also keep the boundary event current removed with it":
        "Manter também o evento de borda que Atual removeu com ele",
    "Also keep the {count} elements current removed with it":
        "Manter também os {count} elementos que Atual removeu com ele",
    "Also keep the boundary event incoming removed with it":
        "Manter também o evento de borda que Entrada removeu com ele",
    "Also keep the {count} elements incoming removed with it":
        "Manter também os {count} elementos que Entrada removeu com ele",
    "Took back the pick of {element}": "Escolha de {element} desfeita",
    "Build": "Gerar",
    "Notes of the build": "Notas da geração",
    "Compare with current": "Comparar com Atual",
    "Compare with incoming": "Comparar com Entrada",
    "Result against current": "Resultado em relação a Atual",
    "Result against incoming": "Resultado em relação a Entrada",
    "Result": "Resultado",
    "Review notes ({count})": "Revisar notas ({count})",
    "The build moved {element} to meet {shapes}":
        "Ao gerar, {element} foi movido para alcançar {shapes}",
    "{element} does not meet {shapes}; the build could not repair it":
        "{element} não alcança {shapes}; ao gerar, não foi possível corrigi-lo",
    "The build moved {element} off {shapes}": "Ao gerar, {element} foi afastado de {shapes}",
    "The build moved {element} off {shapes} and made room by shifting {shifted}":
        "Ao gerar, {element} foi afastado de {shapes} e foi aberto espaço deslocando {shifted}",
    "{first} and {second} lie on top of each other; the build could not repair it":
        "{first} e {second} estão um sobre o outro; ao gerar, não foi possível corrigi-lo",
    "The build moved {element} around {shapes}":
        "Ao gerar, {element} foi movido para contornar {shapes}",
    "{element} runs through {shapes}; the build could not repair it":
        "{element} passa por {shapes}; ao gerar, não foi possível corrigi-lo",
    "{element} lies outside {shapes}": "{element} está fora de {shapes}",
    "{element} is not on the border of {host}": "{element} não está na borda de {host}",
    "{first} and {second} overlap": "{first} e {second} se sobrepõem",
    "{element} is kept without the flows the other side removed with it: {connections}":
        "{element} é mantido sem os fluxos que o outro lado removeu com ele: {connections}",
    "{element} is kept without the boundary event the other side removed with it: {elements}":
        "{element} é mantido sem o evento de borda que o outro lado removeu com ele: {elements}",
    "{element} is kept without the {count} elements the other side removed with it: {elements}":
        "{element} é mantido sem os {count} elementos que o outro lado removeu com ele: {elements}",
    "{flow} is kept but is no longer the default flow of {element}":
        "{flow} é mantido, mas não é mais o fluxo padrão de {element}",
    "{flow} is kept, but {element} keeps {keptDefault} as its default flow":
        "{flow} é mantido, mas {element} mantém {keptDefault} como seu fluxo padrão",
    "The file's {attribute} differs between the sides; current's is kept":
        "O atributo {attribute} do arquivo difere entre os lados; o de Atual é mantido",
    "1 conflict left": "1 conflito restante",
    "{count} conflicts left": "{count} conflitos restantes",
    "Elements of this version the result keeps as they are here.":
        "Elementos desta versão que o resultado mantém como estão aqui.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.":
        "Elementos desta versão que o resultado toma da outra versão, ou deixa de fora porque a outra versão os removeu.",
    "Open conflicts on elements this version has.":
        "Conflitos abertos em elementos que esta versão tem.",
    "Elements only the other version has are counted on the other pane only.":
        "Elementos que só a outra versão tem são contados apenas no outro painel.",
    "More actions": "Mais ações",
    "This step has no shape, so it is listed here.":
        "Esta etapa não tem forma, por isso aparece aqui.",
    "Not visible in the diagram ({count})": "Não visíveis no diagrama ({count})",
    "1 open conflict not visible in the diagram": "1 conflito aberto não visível no diagrama",
    "{count} open conflicts not visible in the diagram":
        "{count} conflitos abertos não visíveis no diagrama",
    "Keep current with everything inside": "Manter Atual com todo o conteúdo",
    "Keep incoming with everything inside": "Manter Entrada com todo o conteúdo",
    "Leave out": "Deixar de fora",
    "Also keep what was removed with it": "Manter também o que foi removido com ele",
    "Keep it as current has it": "Manter como Atual o tem",
    "Keep it as incoming has it": "Manter como Entrada o tem",
    "Keep it and everything inside as current has them":
        "Manter com todo o conteúdo como Atual o tem",
    "Keep it and everything inside as incoming has them":
        "Manter com todo o conteúdo como Entrada o tem",
    "Keep it and every pool with its process as current has them":
        "Manter com cada pool e seu processo como Atual os tem",
    "Keep it and every pool with its process as incoming has them":
        "Manter com cada pool e seu processo como Entrada os tem",
    "Leave it out, as current removed it": "Deixar de fora, pois Atual o removeu",
    "Leave it out, as current doesn't have it": "Deixar de fora, pois Atual não o tem",
    "Leave it out, as incoming removed it": "Deixar de fora, pois Entrada o removeu",
    "Leave it out, as incoming doesn't have it": "Deixar de fora, pois Entrada não o tem",
    "Go back to what the merge decided by itself": "Voltar ao que a mesclagem decidiu sozinha",
    "none": "sem valor",
    "and other content": "e outro conteúdo",
    "Removed in current": "Removido em Atual",
    "Not in current": "Não está em Atual",
    "Removed in incoming": "Removido em Entrada",
    "Not in incoming": "Não está em Entrada",
    "Kept from current with everything inside: {element}":
        "Mantido de Atual com todo o conteúdo: {element}",
    "Kept from incoming with everything inside: {element}":
        "Mantido de Entrada com todo o conteúdo: {element}",
    "Kept from current with what was removed with it: {element}":
        "Mantido de Atual com o que foi removido com ele: {element}",
    "Kept from incoming with what was removed with it: {element}":
        "Mantido de Entrada com o que foi removido com ele: {element}",
    "Left out: {element}, as current removed it":
        "Deixado de fora: {element}, pois Atual o removeu",
    "Left out: {element}, as current doesn't have it":
        "Deixado de fora: {element}, pois Atual não o tem",
    "Left out: {element}, as incoming removed it":
        "Deixado de fora: {element}, pois Entrada o removeu",
    "Left out: {element}, as incoming doesn't have it":
        "Deixado de fora: {element}, pois Entrada não o tem",
    "Took back the pick. {element} is an open conflict again.":
        "Escolha desfeita. {element} é novamente um conflito aberto.",
    "Can't keep {element}": "Não é possível manter {element}",
    "Can't leave out {element}": "Não é possível deixar {element} de fora",
    "Can't take back the pick of {element}": "Não é possível desfazer a escolha de {element}",
    "Nothing blocks keeping {element} now": "Agora nada impede manter {element}",
    "Nothing blocks leaving out {element} now": "Agora nada impede deixar {element} de fora",
    "Nothing blocks taking back the pick of {element} now":
        "Agora nada impede desfazer a escolha de {element}",
    "{element} needs {target}; no version has it":
        "{element} precisa de {target}; nenhuma versão o tem",
    "{element} needs {target}; your pick takes a side without it":
        "{element} precisa de {target}; sua escolha toma um lado sem ele",
    "{element} needs a part of {target}; your pick takes a side without it":
        "{element} precisa de uma parte de {target}; sua escolha toma um lado sem ela",
    "{element} needs {target}; this pick drops it":
        "{element} precisa de {target}; esta escolha o descarta",
    "{element} needs a part of {target} this pick leaves out":
        "{element} precisa de uma parte de {target} que esta escolha deixa de fora",
    "{element} needs {target}; this side lacks it":
        "{element} precisa de {target}; este lado não o tem",
    "{element} needs a part of {target}; this side lacks it":
        "{element} precisa de uma parte de {target}; este lado não a tem",
    "{element} needs {target}; the result leaves it out":
        "{element} precisa de {target}; o resultado o deixa de fora",
    "{element} needs a part of {target} the kept version lacks":
        "{element} precisa de uma parte de {target} que falta na versão mantida",
    "Your pick of {element} needs {target}": "Sua escolha de {element} precisa de {target}",
    "{element} and {target} have a pool of the same process":
        "{element} e {target} têm um pool do mesmo processo",
    "{element} needs it; no version has it": "{element} precisa dele; nenhuma versão o tem",
    "{element} needs it; your pick takes a side without it":
        "{element} precisa dele; sua escolha toma um lado sem ele",
    "{element} needs a part of it; your pick takes a side without it":
        "{element} precisa de uma parte dele; sua escolha toma um lado sem ela",
    "{element} needs it": "{element} precisa dele",
    "{element} needs a part of it this pick leaves out":
        "{element} precisa de uma parte dele que esta escolha deixa de fora",
    "{element} needs it; this side lacks it": "{element} precisa dele; este lado não o tem",
    "{element} needs a part of it; this side lacks it":
        "{element} precisa de uma parte dele; este lado não a tem",
    "{element} needs a part of it the kept version lacks":
        "{element} precisa de uma parte dele que falta na versão mantida",
    "Your pick of {element} needs it": "Sua escolha de {element} precisa dele",
    "This pick brings in {element}, which needs it":
        "Esta escolha inclui {element}, que precisa dele",
    "{element} holds the same ID": "{element} tem o mesmo ID",
    "{element} has a pool of the same process": "{element} tem um pool do mesmo processo",
    "and {count} more": "e mais {count}",
    "Data store": "Repositório de dados",
    "Item definition": "Definição de item",
    "Category": "Categoria",
    "Interface": "Interface",
    "End point": "Ponto de extremidade",
    "Partner entity": "Entidade parceira",
    "Partner role": "Papel de parceiro",
    "Correlation property": "Propriedade de correlação",
    "Global task": "Tarefa global",
    "Flow from {source} to {target}": "Fluxo de {source} para {target}",
    "Both sides changed the layout of {elements}; current's is kept":
        "Ambos os lados alteraram o layout de {elements}; o de Atual é mantido",
    "Both sides changed the layout of {elements}; incoming's is kept":
        "Ambos os lados alteraram o layout de {elements}; o de Entrada é mantido",
    "by hand": "à mão",
    "Edit again": "Editar novamente",
    "Keep my XML": "Manter meu XML",
    "Keep the XML merged before": "Manter o XML mesclado antes",
    "Merge XML": "Mesclar XML",
    "Merge both sides' changes to its XML by hand in a merge editor":
        "Mesclar à mão as alterações dos dois lados no XML em um editor de mesclagem",
    "Edit merged XML": "Editar XML mesclado",
    "Change the XML you merged by hand": "Alterar o XML que você mesclou à mão",
    "Keep current's version": "Manter a versão de Atual",
    "Keep incoming's version": "Manter a versão de Entrada",
    "Drop it and pick": "Descartar e escolher",
    "Drop it and leave out": "Descartar e deixar de fora",
    "Drop it and undo": "Descartar e desfazer",
    "Kept from current and merged by hand, your pick":
        "Mantido de Atual e mesclado à mão, sua escolha",
    "Kept from incoming and merged by hand, your pick":
        "Mantido de Entrada e mesclado à mão, sua escolha",
    "Kept from current with everything inside and merged by hand, your pick":
        "Mantido de Atual com todo o conteúdo e mesclado à mão, sua escolha",
    "Kept from incoming with everything inside and merged by hand, your pick":
        "Mantido de Entrada com todo o conteúdo e mesclado à mão, sua escolha",
    "Kept from current with what was removed with it and merged by hand, your pick":
        "Mantido de Atual com o que foi removido com ele e mesclado à mão, sua escolha",
    "Kept from incoming with what was removed with it and merged by hand, your pick":
        "Mantido de Entrada com o que foi removido com ele e mesclado à mão, sua escolha",
    "Merged by hand: {element}": "Mesclado à mão: {element}",
    "Closed without saving: {element} is unchanged":
        "Fechado sem salvar: {element} não foi alterado",
    "This drops the XML you merged by hand for {elements}":
        "Isto descarta o XML que você mesclou à mão para {elements}",
    "The XML of {element} still holds conflict markers":
        "O XML de {element} ainda contém marcadores de conflito",
    "The XML of {element} doesn't parse": "O XML de {element} não pode ser analisado",
    "The XML of {element} must hold one element":
        "O XML de {element} deve conter um único elemento",
    "The XML of {element} changes its type": "O XML de {element} altera seu tipo",
    "The XML of {element} changes its ID": "O XML de {element} altera seu ID",
    "The XML of {element} holds elements of their own":
        "O XML de {element} contém elementos próprios",
    "The XML of {element} goes beyond its own content":
        "O XML de {element} vai além do próprio conteúdo",
    "The XML of {element} names an element of the wrong type":
        "O XML de {element} nomeia um elemento do tipo errado",
    "The XML of {element} uses an unknown namespace":
        "O XML de {element} usa um namespace desconhecido",
    "The engine doesn't take the XML of {element}": "O motor não aceita o XML de {element}",
    "The XML of {element} changes what follows the pick":
        "O XML de {element} altera o que segue a escolha",
    "The XML of {element} names an element no version has":
        "O XML de {element} nomeia um elemento que nenhuma versão tem",
    "The XML of {element} names an element the result leaves out":
        "O XML de {element} nomeia um elemento que o resultado deixa de fora",
    "The XML of {element} would change other decisions":
        "O XML de {element} mudaria outras decisões",
    "The pick of {element} changed while you merged it":
        "A escolha de {element} mudou enquanto você mesclava",
    "Resolve each conflict and remove its markers, then save.":
        "Resolva cada conflito e remova seus marcadores; depois salve.",
    "The parser says: {detail}": "O analisador diz: {detail}",
    "It holds {count} elements at its top level.": "Contém {count} elementos no nível superior.",
    "It is a {found} now; keep it a {expected}.": "Agora é um {found}; mantenha como {expected}.",
    "Its ID is {found} now; keep {expected}.": "Seu ID agora é {found}; mantenha {expected}.",
    "It has no ID now; keep {expected}.": "Agora não tem ID; mantenha {expected}.",
    "Merge these on their own, with a pick: {elements}":
        "Mescle estes separadamente, com uma escolha: {elements}",
    "Only its attributes, documentation and extension elements merge here, not {properties}.":
        "Aqui só se mesclam seus atributos, documentação e elementos de extensão, não {properties}.",
    "{target} as {property}, which takes a {expected}":
        "{target} como {property}, que aceita um {expected}",
    "No version declares {namespaces}.": "Nenhuma versão declara {namespaces}.",
    "The engine says: {detail}": "O motor diz: {detail}",
    "{properties} follow the side you picked.": "{properties} seguem o lado que você escolheu.",
    "No version has {elements}.": "Nenhuma versão tem {elements}.",
    "The result leaves out {elements}.": "O resultado deixa de fora {elements}.",
    "It would change the decisions on {elements}.": "Mudaria as decisões sobre {elements}.",
    "It is no longer picked on the side you merged it for.":
        "Não está mais escolhido no lado para o qual você o mesclou.",
};

export default dictionary;
