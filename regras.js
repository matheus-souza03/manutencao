// Regras do app sem dependência do navegador: validação, fila, resposta da planilha e datas.
// Testadas com node --test (app_campo/tests/).
import { CAMPOS } from "./campos.js";

export const VERSAO_CONTRATO = 2; // igual a VERSAO_CONTRATO do Apps Script
export const TAMANHO_MAXIMO_TEXTO = 300; // igual ao Apps Script
export const DIAS_ENVIADOS_VISIVEIS = 7;
export const DIAS_PENDENCIA_ANTIGA = 2;
const DIA_MS = 24 * 60 * 60 * 1000;
const RE_NUMERO = /^\d+([.,]\d+)?$/; // igual ao Apps Script: "6", "06", "1,5"
const RE_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export const SITUACAO = {
  PENDENTE: "pendente",
  ENVIANDO: "enviando",
  ERRO: "erro",
  ENVIADO: "enviado",
};

// ---------- Formulário ----------

export function limparTexto(valor) {
  if (typeof valor === "number") valor = String(valor);
  return typeof valor === "string" ? valor.split(/\s+/).filter(Boolean).join(" ") : "";
}

/** Erros por campo ({chave: mensagem}), na ordem da tela; vazio quando está tudo certo. */
export function validarFormulario(valores, fotos, campos = CAMPOS, hoje = dataDeHoje()) {
  const erros = {};
  if (!fotos.antes) erros.foto_antes = "Falta a foto do antes.";
  if (!fotos.depois) erros.foto_depois = "Falta a foto do depois.";
  campos.forEach((campo) => {
    const erro = erroDoCampo(campo, limparTexto(valores[campo.chave]), hoje);
    if (erro) erros[campo.chave] = erro;
  });
  return erros;
}

function erroDoCampo(campo, texto, hoje) {
  if (!texto) return campo.obrigatorio ? `${campo.opcoes ? "Escolha" : "Preencha"} ${campo.nome}.` : "";
  if (texto.length > TAMANHO_MAXIMO_TEXTO) return `Use no máximo ${TAMANHO_MAXIMO_TEXTO} letras.`;
  if (campo.tipo === "numero" && !RE_NUMERO.test(texto)) return "Use só números, por exemplo 6 ou 1,5.";
  if (campo.tipo === "data") {
    if (!dataValida(texto)) return "Data inválida.";
    if (texto > hoje) return "A data não pode ser depois de hoje.";
  }
  return "";
}

function dataValida(texto) {
  const partes = RE_DATA.exec(texto);
  if (!partes) return false;
  const data = new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  return data.toISOString().slice(0, 10) === texto;
}

/** "2026-10-30": a data de hoje no celular, como o campo de data usa. */
export function dataDeHoje(agora = new Date()) {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** Sem fotos e sem nada digitado. A data não conta: ela já vem preenchida com hoje. */
export function formularioVazio(valores, fotos, campos = CAMPOS) {
  if (fotos.antes || fotos.depois) return false;
  return campos.every((campo) => campo.tipo === "data" || !limparTexto(valores[campo.chave]));
}

/** O endereço do Apps Script, mesmo que tenha sido colado com algum texto em volta. */
export function lerUrl(texto) {
  const achado = /https?:\/\/[^\s"'<>]+/.exec(String(texto || ""));
  return achado ? achado[0] : "";
}

export function limparCampos(valores, campos = CAMPOS) {
  const limpos = {};
  campos.forEach((campo) => {
    limpos[campo.chave] = limparTexto(valores[campo.chave]);
  });
  return limpos;
}

/** Corpo do POST para o Apps Script (contrato na especificação). */
export function montarEnvio(item, base64Antes, base64Depois, campos = CAMPOS) {
  const corpo = { versao: VERSAO_CONTRATO, id: item.id, registrado_em: item.registrado_em };
  campos.forEach((campo) => {
    corpo[campo.chave] = item.campos[campo.chave] || "";
  });
  corpo.foto_antes = { tipo: "image/jpeg", base64: base64Antes };
  corpo.foto_depois = { tipo: "image/jpeg", base64: base64Depois };
  return corpo;
}

// ---------- Fila ----------

export function emOrdem(itens) {
  return itens.slice().sort((a, b) => a.ordem - b.ordem);
}

export function aguardando(itens) {
  return emOrdem(itens).filter((item) => item.situacao !== SITUACAO.ENVIADO);
}

/**
 * Próximo item a enviar, sempre o mais antigo ainda não enviado.
 * Se ele estiver com erro, a fila para ({parado: true}) até o técnico corrigir ou apagar.
 */
export function proximoParaEnviar(itens) {
  const primeiro = aguardando(itens)[0];
  if (!primeiro) return { item: null, parado: false };
  return { item: primeiro, parado: primeiro.situacao === SITUACAO.ERRO };
}

/** Só dá para corrigir ou apagar o que ainda não foi (nem está sendo) enviado. */
export function podeMexer(item) {
  return Boolean(item) && (item.situacao === SITUACAO.PENDENTE || item.situacao === SITUACAO.ERRO);
}

/** Entende a resposta do Apps Script. tipo: "enviado" | "erro" | "tentar_depois". */
export function interpretarResposta({ erroRede, abortado, status, texto }) {
  if (abortado) return tentarDepois("A planilha demorou demais para responder.");
  if (erroRede) return tentarDepois("Sem conexão com a planilha.");
  if (status < 200 || status >= 300) return tentarDepois(`A planilha não respondeu (código ${status}).`);
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch (erro) {
    return tentarDepois("A planilha respondeu de um jeito inesperado. Se continuar, avise o escritório.");
  }
  if (!dados || typeof dados !== "object") {
    return tentarDepois("A planilha respondeu de um jeito inesperado. Se continuar, avise o escritório.");
  }
  if (dados.ok === true) return { tipo: "enviado", linha: dados.linha, duplicado: Boolean(dados.duplicado) };
  const mensagem = typeof dados.erro === "string" && dados.erro ? dados.erro : "A planilha recusou o lançamento.";
  return dados.temporario === true ? tentarDepois(mensagem) : { tipo: "erro", mensagem: mensagem };
}

function tentarDepois(mensagem) {
  return { tipo: "tentar_depois", mensagem: mensagem };
}

/** Mudanças a gravar no item depois de uma tentativa de envio. */
export function aplicarResultado(item, resultado, agoraMs) {
  const tentativas = (item.tentativas || 0) + 1;
  if (resultado.tipo === "enviado") {
    // As fotos saem do celular: já estão no Drive.
    return {
      situacao: SITUACAO.ENVIADO,
      enviado_ms: agoraMs,
      linha: resultado.linha,
      foto_antes: null,
      foto_depois: null,
      tentativas: tentativas,
      ultimo_erro: null,
    };
  }
  return {
    situacao: resultado.tipo === "erro" ? SITUACAO.ERRO : SITUACAO.PENDENTE,
    tentativas: tentativas,
    ultimo_erro: resultado.mensagem,
    ultima_tentativa_ms: agoraMs,
  };
}

/** IDs dos enviados há mais de 7 dias, que saem da lista. */
export function enviadosParaLimpar(itens, agoraMs) {
  const limite = agoraMs - DIAS_ENVIADOS_VISIVEIS * DIA_MS;
  return itens.filter((item) => item.situacao === SITUACAO.ENVIADO && item.enviado_ms < limite).map((item) => item.id);
}

export function temPendenciaAntiga(itens, agoraMs) {
  const limite = agoraMs - DIAS_PENDENCIA_ANTIGA * DIA_MS;
  return aguardando(itens).some((item) => item.criado_ms < limite);
}

// ---------- Textos e datas ----------

/** "Rua Barão de Vila Franca, 12" */
export function textoEndereco(campos) {
  return [campos.logradouro, campos.numero].filter(Boolean).join(", ");
}

/** "2026-10-30T14:05:00-03:00": hora local do celular com o fuso. */
export function isoComFuso(data, minutosAtras = data.getTimezoneOffset()) {
  const local = new Date(data.getTime() - minutosAtras * 60000);
  const sinal = minutosAtras > 0 ? "-" : "+";
  const fuso = Math.abs(minutosAtras);
  return `${local.toISOString().slice(0, 19)}${sinal}${dois(Math.floor(fuso / 60))}:${dois(fuso % 60)}`;
}

/** "hoje às 14:05", "ontem às 09:10" ou "28/10 às 14:05" (hora local). */
export function formatarQuando(ms, agoraMs) {
  const data = new Date(ms);
  const hora = `${dois(data.getHours())}:${dois(data.getMinutes())}`;
  const dias = Math.round((inicioDoDia(new Date(agoraMs)) - inicioDoDia(data)) / DIA_MS);
  if (dias === 0) return `hoje às ${hora}`;
  if (dias === 1) return `ontem às ${hora}`;
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} às ${hora}`;
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

function dois(numero) {
  return String(numero).padStart(2, "0");
}

/** Bytes da foto em base64, em pedaços para não estourar a pilha com fotos grandes. */
export function bytesParaBase64(bytes) {
  let binario = "";
  const PEDACO = 0x8000;
  for (let i = 0; i < bytes.length; i += PEDACO) {
    binario += String.fromCharCode.apply(null, bytes.subarray(i, i + PEDACO));
  }
  return btoa(binario);
}
