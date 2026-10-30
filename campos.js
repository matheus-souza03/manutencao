// Campos do formulário, na ordem da tela (os mesmos do Forms). Cada chave existe também em CAMPOS
// do Apps Script (apps_script/Logica.gs), que diz a coluna da planilha. Veja "Acrescentar um campo"
// no LEIA-ME. Depois de qualquer mudança aqui, aumente VERSAO em sw.js.
//   chave: nome no envio | rotulo: texto na tela | nome: como aparece nas mensagens
//   obrigatorio: true = não pode ficar vazio (sem isso, pode)
//   tipo: "texto" (padrão), "numero" ou "data", igual ao Apps Script
//   opcoes: escolhas prontas; aparecem como botões, ou como lista com lista: true
//   junto: fica colado ao campo de cima (a quantidade do material)
//   secao + explicacao: título que aparece antes do campo
//   teclado, maiusculas: teclado do celular | sugestoes: lembra o que já foi digitado | dica: ajuda

// Listas de escolha do Forms, com os mesmos textos e na mesma ordem (conferidas em 30/10/2026).
// Para pôr ou tirar uma opção, edite só aqui.
const LAMPADAS = [
  "MISTA 160", "MISTA 250",
  "LVS 70", "LVS 150", "LVS 250", "LVS 400",
  "LVM 150", "LVM 250", "LVM 400", "LVM 2000", "LVM 125",
  "LED",
];
const REATORES = ["RA70", "RA150", "RA250", "RA400", "RS150", "RS250", "RI400"];
const CABOS = [
  "COBRE 1,5MM2", "COBRE 2,5MM2", "COBRE 4MM2", "COBRE 6MM2", "COBRE 10MM2", "COBRE 16MM2",
  "ALUM 10MM2", "ALUM 16MM2", "ALUM 25MM2", "ALUM 35MM2",
  "ALUM MULTI 16MM2", "ALUM MULTI 25MM2",
];
const PARAFUSOS = ['5/8"x2.1/2"', "250 MM", "300 MM"];
const UM_A_TRES = ["1", "2", "3"];

export const CAMPOS = [
  { chave: "logradouro", rotulo: "Logradouro", nome: "o logradouro", obrigatorio: true, maiusculas: "words", sugestoes: true },
  { chave: "bairro", rotulo: "Bairro", nome: "o bairro", obrigatorio: true, maiusculas: "words", sugestoes: true },
  { chave: "numero", rotulo: "Nº", nome: "o número", obrigatorio: true, maiusculas: "none", dica: 'Sem número? Escreva "s/n".' },
  { chave: "data", rotulo: "Data do serviço", nome: "a data do serviço", obrigatorio: true, tipo: "data" },

  { secao: "Material usado", explicacao: "Preencha só o que usou.", chave: "lampada", rotulo: "Lâmpada", nome: "a lâmpada", opcoes: LAMPADAS, lista: true },
  { chave: "lampada_qtd", rotulo: "Quantidade", nome: "a quantidade de lâmpadas", tipo: "numero", opcoes: ["1", "2"], junto: true },
  { chave: "reator", rotulo: "Reator", nome: "o reator", opcoes: REATORES, lista: true },
  { chave: "reator_qtd", rotulo: "Quantidade", nome: "a quantidade de reatores", tipo: "numero", opcoes: UM_A_TRES, junto: true },
  { chave: "cabo", rotulo: "Cabo", nome: "o cabo", opcoes: CABOS, lista: true },
  { chave: "cabo_metros", rotulo: "Metros", nome: "os metros de cabo", tipo: "numero", junto: true },
  { chave: "braco", rotulo: "Braço", nome: "o braço", opcoes: ["1000MM", "2500MM"] },
  { chave: "braco_qtd", rotulo: "Quantidade", nome: "a quantidade de braços", tipo: "numero", opcoes: UM_A_TRES, junto: true },
  { chave: "luminaria", rotulo: "Luminária", nome: "a luminária", opcoes: ["FECHADA", "ABERTA", "LED"] },
  { chave: "luminaria_qtd", rotulo: "Quantidade", nome: "a quantidade de luminárias", tipo: "numero", opcoes: UM_A_TRES, junto: true },
  { chave: "eletroduto_metros", rotulo: 'Eletroduto de PVC 3/4" (metros)', nome: "os metros de eletroduto", tipo: "numero" },
  { chave: "cinta", rotulo: "Cinta (par)", nome: "a cinta", opcoes: ["140MM", "220MM"] },
  { chave: "porca_arruela_qtd", rotulo: "Porca/arruela (quantidade)", nome: "a quantidade de porcas/arruelas", tipo: "numero" },
  { chave: "parafuso", rotulo: "Parafuso", nome: "o parafuso", opcoes: PARAFUSOS, lista: true },
  { chave: "parafuso_qtd", rotulo: "Quantidade", nome: "a quantidade de parafusos", tipo: "numero", junto: true },
  { chave: "rele_qtd", rotulo: "Relé (quantidade)", nome: "a quantidade de relés", tipo: "numero" },
  { chave: "base_rele_qtd", rotulo: "Base para relé (quantidade)", nome: "a quantidade de bases para relé", tipo: "numero" },
  { chave: "chave_contactora", rotulo: "Chave contactora", nome: "a chave contactora", opcoes: ["TRI 32A", "TRI 45A", "TRI 65A"] },
  { chave: "disjuntor", rotulo: "Disjuntor", nome: "o disjuntor", opcoes: ["BI 10A", "TRI 10A", "TRI 60A"] },
  { chave: "receptaculo_qtd", rotulo: "Receptáculo (quantidade)", nome: "a quantidade de receptáculos", tipo: "numero", opcoes: UM_A_TRES },
  { chave: "conector_qtd", rotulo: "Conector perfurante (quantidade)", nome: "a quantidade de conectores perfurantes", tipo: "numero", opcoes: UM_A_TRES },
];
