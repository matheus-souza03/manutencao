// Campos de texto do formulário, na ordem da tela. Para acrescentar um campo, uma linha aqui
// e a mesma chave em CAMPOS_TEXTO do Apps Script (veja apps_script/LEIA-ME.md).
//   chave: nome no envio | rotulo: texto na tela | nome: como aparece nas mensagens de erro
//   obrigatorio: false = pode ficar vazio | teclado: inputmode do celular
//   maiusculas: autocapitalize | sugestoes: lembra o que já foi digitado | dica: texto de ajuda
export const CAMPOS = [
  { chave: "logradouro", rotulo: "Logradouro", nome: "o logradouro", obrigatorio: true, teclado: "text", maiusculas: "words", sugestoes: true },
  { chave: "bairro", rotulo: "Bairro", nome: "o bairro", obrigatorio: true, teclado: "text", maiusculas: "words", sugestoes: true },
  { chave: "numero", rotulo: "Nº", nome: "o número", obrigatorio: true, teclado: "text", maiusculas: "none", dica: 'Sem número? Escreva "s/n".' },
];
