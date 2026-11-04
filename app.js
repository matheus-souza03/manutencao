// Tela do app: formulário, fila e indicador de conexão.
import { CAMPOS } from "./campos.js";
import { enviarFila } from "./envio.js";
import { criarFila } from "./fila.js";
import { reduzirFoto } from "./fotos.js";
import {
  SITUACAO,
  TAMANHO_MAXIMO_TEXTO,
  aguardando,
  dataDeHoje,
  emOrdem,
  formatarQuando,
  formularioVazio,
  isoComFuso,
  limparCampos,
  podeMexer,
  proximoParaEnviar,
  somenteNumeros,
  temPendenciaAntiga,
  textoEndereco,
  validarFormulario,
} from "./regras.js";

const ETIQUETA_SYNC = "enviar-fila";
const INTERVALO_ENVIO_MS = 30 * 1000;
const MAXIMO_SUGESTOES = 200;
const LADOS = ["antes", "depois"];

const fila = criarFila();
const canal = "BroadcastChannel" in self ? new BroadcastChannel("manutencao") : null;
const $ = (id) => document.getElementById(id);

const estado = {
  itens: [],
  editando: null, // id do item sendo corrigido
  fotos: { antes: null, depois: null },
  preparandoFotos: 0,
  enviando: false,
  sugestoes: {},
};

// ---------- Início ----------

async function iniciar() {
  atualizarConexao();
  registrarServiceWorker();
  pedirArmazenamentoPersistente();
  estado.sugestoes = (await fila.lerControle("sugestoes")) || {};
  preencherSugestoes();
  preencher(null, null);
  await restaurarRascunho();
  acompanharHoje();
  await atualizar();
  enviarAgora();
  setInterval(() => {
    if (navigator.onLine && aguardando(estado.itens).length > 0) enviarAgora();
  }, INTERVALO_ENVIO_MS);
}

// Cada campo da tela: ler() e escrever(valor) o valor como texto; alvo recebe o foco e o aviso de erro.
const controles = {};

function montarCampos() {
  let lugar = $("campos");
  CAMPOS.forEach((campo, indice) => {
    if (campo.secao) {
      lugar = criar("div", "secao");
      lugar.append(criar("h2", "titulo titulo--secao", campo.secao));
      if (campo.explicacao) lugar.append(criar("p", "explicacao", campo.explicacao));
      $("campos").append(lugar);
    }
    const destino = campo.topo ? $("campos-topo") : lugar; // depois da seção: o 1º campo dela entra nela
    const classes = ["campo"];
    if (campo.junto) classes.push("campo--junto");
    if (campo.tipo === "numero" && !campo.opcoes) classes.push("campo--curto");
    const bloco = criar("div", classes.join(" "));
    const id = `campo-${campo.chave}`;
    const rotulo = criar(campo.opcoes && !campo.lista ? "p" : "label", "campo-rotulo", campo.rotulo);
    rotulo.id = `rotulo-${campo.chave}`;
    if (rotulo.tagName === "LABEL") rotulo.htmlFor = id;
    bloco.append(rotulo);

    let controle;
    if (campo.opcoes && !campo.lista) controle = criarBotoes(campo, id);
    else if (campo.opcoes) controle = criarLista(campo, id);
    else controle = criarEntrada(campo, id);
    // "Quantidade" sozinha não diz de quê: quem usa leitor de tela ouve "Lâmpada, Quantidade".
    const anterior = CAMPOS[indice - 1];
    const rotulos = campo.junto && anterior ? `rotulo-${anterior.chave} ${rotulo.id}` : rotulo.id;
    controle.alvo.setAttribute("aria-labelledby", rotulos);
    bloco.append(controle.alvo);

    // O erro fica logo abaixo do campo, antes da dica.
    const erro = criar("p", "erro");
    erro.id = `erro-${campo.chave}`;
    bloco.append(erro);
    const descricoes = [erro.id];
    if (campo.dica) {
      const dica = criar("p", "dica", campo.dica);
      dica.id = `dica-${campo.chave}`;
      descricoes.unshift(dica.id);
      bloco.append(dica);
    }
    if (campo.sugestoes) {
      const lista = criar("datalist");
      lista.id = `sugestoes-${campo.chave}`;
      controle.alvo.setAttribute("list", lista.id);
      bloco.append(lista);
    }
    controle.alvo.setAttribute("aria-describedby", descricoes.join(" "));
    controles[campo.chave] = controle;
    destino.append(bloco);
  });
}

function criarEntrada(campo, id) {
  const entrada = criar("input");
  Object.assign(entrada, { id: id, name: campo.chave, autocomplete: "off" });
  if (campo.tipo === "data") {
    entrada.type = "date";
  } else {
    entrada.type = "text";
    entrada.maxLength = TAMANHO_MAXIMO_TEXTO;
    const teclado = campo.tipo === "numero" ? (campo.decimais ? "decimal" : "numeric") : campo.teclado || "text";
    entrada.setAttribute("inputmode", teclado);
    entrada.setAttribute("autocapitalize", campo.maiusculas || "sentences");
    entrada.setAttribute("enterkeyhint", "next");
    if (campo.tipo === "numero") {
      // Só números: o que não for algarismo (ou a vírgula dos metros) some enquanto digita ou cola.
      entrada.addEventListener("input", () => {
        const limpo = somenteNumeros(entrada.value, campo.decimais);
        if (limpo !== entrada.value) entrada.value = limpo;
      });
    }
  }
  return {
    alvo: entrada,
    ler: () => entrada.value,
    escrever: (valor) => (entrada.value = valor),
  };
}

/** Lista que abre por cima (como "Escolher" no Forms), para listas compridas. */
function criarLista(campo, id) {
  const lista = criar("select");
  Object.assign(lista, { id: id, name: campo.chave });
  const nenhuma = criar("option", "", campo.obrigatorio ? "Escolher" : "Não usou");
  nenhuma.value = "";
  lista.append(nenhuma, ...campo.opcoes.map((opcao) => Object.assign(criar("option", "", opcao), { value: opcao })));
  return {
    alvo: lista,
    ler: () => lista.value,
    escrever: (valor) => (lista.value = campo.opcoes.includes(valor) ? valor : ""),
  };
}

/** Botões lado a lado: um toque escolhe; tocar de novo no escolhido desmarca. */
function criarBotoes(campo, id) {
  const grupo = criar("div", "opcoes");
  grupo.id = id;
  grupo.tabIndex = -1;
  grupo.setAttribute("role", "group");
  let valor = "";
  const botoes = campo.opcoes.map((opcao) => {
    const botao = criar("button", "opcao", opcao);
    botao.type = "button";
    botao.addEventListener("click", () => {
      escrever(valor === opcao ? "" : opcao);
      limparErro(campo.chave);
      salvarRascunhoDepois();
    });
    return botao;
  });
  function escrever(novo) {
    valor = campo.opcoes.includes(novo) ? novo : "";
    botoes.forEach((botao, i) => botao.setAttribute("aria-pressed", String(campo.opcoes[i] === valor)));
  }
  escrever("");
  grupo.append(...botoes);
  return { alvo: grupo, ler: () => valor, escrever: escrever };
}

/** A data já vem com hoje; o máximo do calendário também acompanha o dia. */
function valorInicial(campo) {
  return campo.tipo === "data" ? dataDeHoje() : "";
}

function acompanharHoje() {
  CAMPOS.filter((campo) => campo.tipo === "data").forEach((campo) => {
    controles[campo.chave].alvo.max = dataDeHoje();
  });
  // App aberto de um dia para o outro com o formulário em branco: a data passa a ser a de hoje.
  if (!estado.editando && formularioVazio(lerValores(), estado.fotos)) {
    CAMPOS.filter((campo) => campo.tipo === "data").forEach((campo) => controles[campo.chave].escrever(dataDeHoje()));
  }
}

function ligarEventos() {
  $("formulario").addEventListener("submit", salvar);
  $("formulario").addEventListener("input", (evento) => {
    if (evento.target.name) limparErro(evento.target.name);
    salvarRascunhoDepois();
  });
  LADOS.forEach((lado) => {
    // entrada-: abre a câmera (o quadro); galeria-: escolhe uma foto já tirada.
    [`entrada-${lado}`, `galeria-${lado}`].forEach((id) => {
      $(id).addEventListener("change", (evento) => {
        const arquivo = evento.target.files && evento.target.files[0];
        evento.target.value = "";
        if (arquivo) escolherFoto(lado, arquivo);
      });
    });
  });
  $("cancelar").addEventListener("click", sairDaCorrecao);
  $("enviar-agora").addEventListener("click", () => enviarAgora({ avisarResultado: true }));
  $("ir-novo").addEventListener("click", () => mostrarTela("novo"));
  document.querySelectorAll(".aba").forEach((aba) => aba.addEventListener("click", () => mostrarTela(aba.dataset.tela)));
  window.addEventListener("online", () => {
    atualizarConexao();
    enviarAgora();
  });
  window.addEventListener("offline", atualizarConexao);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    acompanharHoje();
    atualizar().then(() => enviarAgora());
  });
  if (canal) canal.onmessage = () => atualizar();
}

// ---------- Telas ----------

function mostrarTela(tela) {
  $("recado").hidden = true;
  $("tela-novo").hidden = tela !== "novo";
  $("tela-fila").hidden = tela !== "fila";
  document.querySelectorAll(".aba").forEach((aba) => {
    if (aba.dataset.tela === tela) aba.setAttribute("aria-current", "page");
    else aba.removeAttribute("aria-current");
  });
  window.scrollTo(0, 0);
}

async function atualizar() {
  estado.itens = await fila.listar();
  desenharConexaoEFila();
  desenharFila();
}

function desenharConexaoEFila() {
  const quantos = aguardando(estado.itens).length;
  $("conexao-fila").textContent = quantos === 0 ? "Tudo enviado" : `${quantos} aguardando`;
  $("aba-contagem").textContent = quantos > 0 ? String(quantos) : "";
  $("aviso-antigo").hidden = !temPendenciaAntiga(estado.itens, Date.now());
}

function atualizarConexao() {
  const online = navigator.onLine;
  $("conexao").classList.toggle("conexao--offline", !online);
  $("conexao-estado").textContent = online ? "Com internet" : "Sem internet";
  desenharFila();
}

function desenharFila() {
  const agora = Date.now();
  const pendentes = aguardando(estado.itens);
  const enviados = emOrdem(estado.itens)
    .filter((item) => item.situacao === SITUACAO.ENVIADO)
    .sort((a, b) => b.enviado_ms - a.enviado_ms);
  const { parado } = proximoParaEnviar(estado.itens);

  $("lista-aguardando").replaceChildren(...pendentes.map((item) => linhaDaFila(item, agora)));
  $("lista-enviados").replaceChildren(...enviados.map((item) => linhaDaFila(item, agora)));
  $("fila-vazia").hidden = pendentes.length > 0;
  $("titulo-enviados").hidden = enviados.length === 0;
  $("aviso-parado").hidden = !parado;
  $("explicacao-offline").hidden = pendentes.length === 0 || parado || navigator.onLine;

  const botao = $("enviar-agora");
  botao.hidden = pendentes.length === 0 || parado || !navigator.onLine;
  botao.disabled = estado.enviando;
  botao.textContent = estado.enviando ? "Enviando…" : "Enviar agora";
}

const ICONES = {
  pendente: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 6v4.5l3 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  enviando: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M5.5 9.5 10 5l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  erro: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 5.8v5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14" r="1.2" fill="currentColor"/></svg>',
  enviado: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4.5 10.5 3.5 3.5 7.5-8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function linhaDaFila(item, agora) {
  const linha = criar("li", `item item--${item.situacao}`);
  linha.append(
    criar("p", "item-endereco", textoEndereco(item.campos)),
    criar("p", "item-detalhe", `${item.campos.bairro} · registrado ${formatarQuando(item.criado_ms, agora)}`)
  );

  const situacao = criar("p", "item-situacao");
  situacao.innerHTML = ICONES[item.situacao] || "";
  situacao.append(criar("span", "", textoSituacao(item, agora)));
  linha.append(situacao);

  // Sem internet o motivo é óbvio; a mensagem só aparece quando há internet e mesmo assim não foi.
  if (item.situacao === SITUACAO.PENDENTE && item.ultimo_erro && navigator.onLine) {
    linha.append(criar("p", "item-ultimo", `Última tentativa ${formatarQuando(item.ultima_tentativa_ms, agora)}: ${item.ultimo_erro}`));
  }

  if (podeMexer(item)) {
    const acoes = criar("div", "item-acoes");
    const corrigir = criar("button", "botao botao--texto", "Corrigir");
    corrigir.type = "button";
    corrigir.addEventListener("click", () => entrarNaCorrecao(item.id));
    const apagar = criar("button", "botao botao--texto perigo", "Apagar");
    apagar.type = "button";
    apagar.addEventListener("click", () => apagarItem(item.id));
    acoes.append(corrigir, apagar);
    linha.append(acoes);
  }
  return linha;
}

function textoSituacao(item, agora) {
  switch (item.situacao) {
    case SITUACAO.ENVIANDO:
      return "Enviando…";
    case SITUACAO.ERRO:
      return `Erro: ${item.ultimo_erro}`;
    case SITUACAO.ENVIADO:
      return `Enviado ${formatarQuando(item.enviado_ms, agora)}`;
    default:
      return "Pendente";
  }
}

// ---------- Fotos ----------

async function escolherFoto(lado, arquivo) {
  const quadro = $(`foto-${lado}`);
  const ajuda = quadro.querySelector(".foto-ajuda");
  estado.preparandoFotos += 1;
  quadro.setAttribute("aria-busy", "true");
  ajuda.textContent = "Preparando foto…";
  limparErro(`foto_${lado}`);
  try {
    estado.fotos[lado] = await reduzirFoto(arquivo);
    mostrarFoto(lado, estado.fotos[lado]);
    salvarRascunho();
  } catch (erro) {
    mostrarErro(`foto_${lado}`, "Não foi possível abrir essa foto. Tire de novo ou escolha outra.");
  } finally {
    estado.preparandoFotos -= 1;
    quadro.removeAttribute("aria-busy");
    ajuda.textContent = "Tirar foto";
  }
}

function mostrarFoto(lado, blob) {
  const quadro = $(`foto-${lado}`);
  const imagem = quadro.querySelector(".foto-imagem");
  if (imagem.dataset.endereco) URL.revokeObjectURL(imagem.dataset.endereco);
  if (blob) {
    imagem.dataset.endereco = URL.createObjectURL(blob);
    imagem.src = imagem.dataset.endereco;
  } else {
    delete imagem.dataset.endereco;
    imagem.removeAttribute("src");
  }
  imagem.hidden = !blob;
  quadro.querySelector(".foto-faixa").hidden = !blob;
  quadro.querySelector(".foto-vazia").hidden = Boolean(blob);
  quadro.classList.toggle("foto--com-imagem", Boolean(blob));
}

// ---------- Formulário ----------

function lerValores() {
  const valores = {};
  CAMPOS.forEach((campo) => {
    valores[campo.chave] = controles[campo.chave].ler();
  });
  return valores;
}

function preencher(valores, fotos) {
  CAMPOS.forEach((campo) => {
    controles[campo.chave].escrever((valores && valores[campo.chave]) || valorInicial(campo));
  });
  LADOS.forEach((lado) => {
    estado.fotos[lado] = (fotos && fotos[lado]) || null;
    mostrarFoto(lado, estado.fotos[lado]);
  });
  limparErros();
}

function mostrarErro(chave, mensagem) {
  const lugar = $(`erro-${chave}`);
  if (lugar) lugar.textContent = mensagem;
  if (controles[chave]) controles[chave].alvo.setAttribute("aria-invalid", "true");
  const lado = chave.replace("foto_", "");
  if (LADOS.includes(lado)) $(`foto-${lado}`).classList.add("foto--erro");
}

function limparErro(chave) {
  const lugar = $(`erro-${chave}`);
  if (lugar) lugar.textContent = "";
  if (controles[chave]) controles[chave].alvo.removeAttribute("aria-invalid");
  const lado = chave.replace("foto_", "");
  if (LADOS.includes(lado)) $(`foto-${lado}`).classList.remove("foto--erro");
}

function limparErros() {
  CAMPOS.forEach((campo) => limparErro(campo.chave));
  LADOS.forEach((lado) => limparErro(`foto_${lado}`));
}

async function salvar(evento) {
  evento.preventDefault();
  if (estado.preparandoFotos > 0) {
    recado("Espere a foto terminar de carregar.");
    return;
  }
  const valores = lerValores();
  const erros = validarFormulario(valores, estado.fotos);
  limparErros();
  const chaves = Object.keys(erros);
  if (chaves.length > 0) {
    chaves.forEach((chave) => mostrarErro(chave, erros[chave]));
    const primeiro = chaves[0].startsWith("foto_") ? $(`entrada-${chaves[0].slice(5)}`) : controles[chaves[0]].alvo;
    primeiro.focus({ preventScroll: true });
    (primeiro.closest(".foto-bloco") || primeiro.closest(".campo")).scrollIntoView({ block: "center" });
    return;
  }

  const campos = limparCampos(valores);
  const fotos = { foto_antes: estado.fotos.antes, foto_depois: estado.fotos.depois };
  const botao = $("salvar");
  botao.disabled = true;
  try {
    if (estado.editando) {
      const id = estado.editando;
      const resultado = await fila.atualizarSe(id, podeMexer, Object.assign({ campos: campos, situacao: SITUACAO.PENDENTE, ultimo_erro: null }, fotos));
      await sairDaCorrecao();
      mostrarTela("fila");
      if (!resultado.ok) {
        recado("Esse lançamento já foi enviado. Agora a correção é na planilha, pelo escritório.");
        return;
      }
      await guardarSugestoes(campos);
      await depoisDeSalvar(id, "Correção salva.");
    } else {
      const agora = new Date();
      const item = await fila.adicionar(
        Object.assign(
          {
            id: crypto.randomUUID(),
            registrado_em: isoComFuso(agora),
            criado_ms: agora.getTime(),
            campos: campos,
            situacao: SITUACAO.PENDENTE,
            tentativas: 0,
            ultimo_erro: null,
          },
          fotos
        )
      );
      preencher(null, null);
      await fila.gravarControle("rascunho", null);
      await guardarSugestoes(campos);
      window.scrollTo(0, 0);
      await depoisDeSalvar(item.id, "Salvo.");
    }
  } finally {
    botao.disabled = false;
  }
}

async function depoisDeSalvar(id, inicio) {
  await atualizar();
  if (!navigator.onLine) {
    pedirEnvioEmSegundoPlano();
    recado(`${inicio} Será enviado quando houver internet.`);
    return;
  }
  // Com internet, a própria tela envia e mostra o resultado; o segundo plano fica de reserva.
  recado(`${inicio} Enviando…`, 0);
  let item = null;
  let resultado = null;
  for (let vez = 0; vez < 2; vez += 1) {
    // A 2ª vez cobre o caso de um envio que já estava terminando quando este item entrou.
    resultado = await enviarAgora();
    item = await fila.obter(id);
    if (!item || item.situacao !== SITUACAO.PENDENTE || item.ultimo_erro) break;
  }
  if (item && item.situacao === SITUACAO.ENVIADO) recado("Enviado.");
  else if (item && item.situacao === SITUACAO.ERRO) recado("A planilha recusou o lançamento. Veja o erro na fila.");
  else if (resultado && resultado.situacao === "parado") recado(`${inicio} A fila está parada num lançamento com erro. Corrija ou apague esse para os outros seguirem.`);
  else if (!navigator.onLine) recado(`${inicio} Será enviado quando houver internet.`);
  else if (resultado && resultado.situacao === "tentar_depois") recado(`${inicio} Não foi possível enviar agora. O app tenta de novo sozinho.`);
  else recado(`${inicio} Vai ser enviado em instantes.`);
}

// ---------- Corrigir e apagar ----------

async function entrarNaCorrecao(id) {
  const item = await fila.obter(id);
  if (!podeMexer(item)) {
    recado("Esse lançamento está sendo enviado agora. Espere um pouco.");
    return;
  }
  await salvarRascunho(); // o que estava sendo lançado volta depois
  estado.editando = id;
  preencher(item.campos, { antes: item.foto_antes, depois: item.foto_depois });
  $("titulo-novo").textContent = "Corrigir lançamento";
  $("titulo-novo").classList.remove("escondido");
  const detalhe = $("detalhe-form");
  detalhe.textContent = `Registrado ${formatarQuando(item.criado_ms, Date.now())}.${item.ultimo_erro && item.situacao === SITUACAO.ERRO ? ` Erro: ${item.ultimo_erro}` : ""}`;
  detalhe.hidden = false;
  $("salvar").textContent = "Salvar correção";
  $("cancelar").hidden = false;
  $("aba-novo").textContent = "Corrigir";
  mostrarTela("novo");
}

async function sairDaCorrecao() {
  if (!estado.editando) return;
  estado.editando = null;
  $("titulo-novo").textContent = "Novo lançamento";
  $("titulo-novo").classList.add("escondido");
  $("detalhe-form").hidden = true;
  $("salvar").textContent = "Salvar";
  $("cancelar").hidden = true;
  $("aba-novo").textContent = "Novo lançamento";
  preencher(null, null);
  await restaurarRascunho();
  mostrarTela("fila");
}

async function apagarItem(id) {
  const item = await fila.obter(id);
  if (!item) return;
  const confirmado = await confirmar({
    titulo: "Apagar este lançamento?",
    texto: `${textoEndereco(item.campos)} – ${item.campos.bairro}. As fotos também saem do celular. Não dá para desfazer.`,
    botao: "Apagar",
  });
  if (!confirmado) return;
  const apagou = await fila.apagarSe(id, podeMexer);
  recado(apagou ? "Lançamento apagado." : "Esse lançamento já foi enviado e não pode mais ser apagado aqui.");
  await atualizar();
  enviarAgora(); // se ele travava a fila, os seguintes já podem ir
}

// ---------- Envio ----------

let envioAtual = null;

/** Envia a fila. Se já houver um envio andando, espera por ele em vez de começar outro. */
async function enviarAgora({ avisarResultado = false } = {}) {
  if (!envioAtual) envioAtual = executarEnvio().finally(() => (envioAtual = null));
  const resultado = await envioAtual;
  if (avisarResultado && resultado) {
    if (resultado.situacao === "tentar_depois") recado(`Não foi possível enviar agora. ${resultado.mensagem}`);
    else if (resultado.situacao === "vazio") recado("Tudo enviado.");
    else if (resultado.situacao === "ocupado") recado("Já está enviando. Espere um pouco.");
  }
  return resultado;
}

async function executarEnvio() {
  estado.enviando = true;
  desenharFila();
  let resultado = null;
  try {
    resultado = await enviarFila({
      fila: fila,
      avisar: () => {
        if (canal) canal.postMessage("mudou");
        atualizar();
      },
    });
  } catch (erro) {
    console.error(erro);
  } finally {
    estado.enviando = false;
    await atualizar();
  }
  if (resultado && resultado.situacao === "tentar_depois") pedirEnvioEmSegundoPlano();
  if (resultado && resultado.situacao === "ocupado") tentarDeNovoEm(resultado.livreEm);
  return resultado;
}

let relogioNovaTentativa = null;

/**
 * Outro envio segura a fila. Pode ser um envio de verdade (o segundo plano) ou o de um app que o
 * Android fechou no meio; nesse caso a trava vence em livreEm e este envio assume logo depois.
 */
function tentarDeNovoEm(livreEm) {
  clearTimeout(relogioNovaTentativa);
  relogioNovaTentativa = setTimeout(() => enviarAgora(), Math.max(1000, livreEm - Date.now() + 500));
}

/** Background Sync: o Chrome envia sozinho quando a internet voltar, mesmo com o app fechado. */
function pedirEnvioEmSegundoPlano() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.ready
    .then((registro) => registro.sync && registro.sync.register(ETIQUETA_SYNC))
    .catch(() => {});
}

// ---------- Rascunho e sugestões ----------

let relogioRascunho = null;

function salvarRascunhoDepois() {
  clearTimeout(relogioRascunho);
  relogioRascunho = setTimeout(salvarRascunho, 400);
}

/** O que está sendo lançado fica guardado: se o Android fechar o app, nada se perde. */
async function salvarRascunho() {
  clearTimeout(relogioRascunho);
  if (estado.editando) return;
  const valores = lerValores();
  const vazio = formularioVazio(valores, estado.fotos);
  await fila.gravarControle("rascunho", vazio ? null : { campos: valores, antes: estado.fotos.antes, depois: estado.fotos.depois });
}

async function restaurarRascunho() {
  const rascunho = await fila.lerControle("rascunho");
  if (rascunho) preencher(rascunho.campos, { antes: rascunho.antes, depois: rascunho.depois });
}

async function guardarSugestoes(campos) {
  CAMPOS.filter((campo) => campo.sugestoes && campos[campo.chave]).forEach((campo) => {
    const lista = (estado.sugestoes[campo.chave] || []).filter((valor) => valor.toLowerCase() !== campos[campo.chave].toLowerCase());
    estado.sugestoes[campo.chave] = [campos[campo.chave]].concat(lista).slice(0, MAXIMO_SUGESTOES);
  });
  await fila.gravarControle("sugestoes", estado.sugestoes);
  preencherSugestoes();
}

function preencherSugestoes() {
  CAMPOS.filter((campo) => campo.sugestoes).forEach((campo) => {
    const opcoes = (estado.sugestoes[campo.chave] || []).map((valor) => {
      const opcao = criar("option");
      opcao.value = valor;
      return opcao;
    });
    $(`sugestoes-${campo.chave}`).replaceChildren(...opcoes);
  });
}

// ---------- Service worker e armazenamento ----------

async function registrarServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let atualizando = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (atualizando) location.reload();
  });
  try {
    const registro = await navigator.serviceWorker.register("sw.js", { type: "module", updateViaCache: "none" });
    const oferecer = (trabalhador) => {
      if (!trabalhador || !navigator.serviceWorker.controller) return; // primeira instalação: nada a avisar
      const aviso = $("aviso-atualizar");
      aviso.hidden = false;
      aviso.onclick = () => {
        atualizando = true;
        aviso.textContent = "Atualizando…";
        trabalhador.postMessage("ativar");
      };
    };
    oferecer(registro.waiting);
    registro.addEventListener("updatefound", () => {
      const novo = registro.installing;
      novo.addEventListener("statechange", () => {
        if (novo.state === "installed") oferecer(novo);
      });
    });
  } catch (erro) {
    console.error("service worker", erro);
  }
}

/** Pede ao Android para não apagar a fila quando faltar espaço. */
async function pedirArmazenamentoPersistente() {
  if (!navigator.storage || !navigator.storage.persist) return;
  if (await navigator.storage.persisted()) return;
  await navigator.storage.persist().catch(() => false);
}

// ---------- Recado e confirmação ----------

let relogioRecado = null;

function recado(texto, duracaoMs = 4000) {
  const lugar = $("recado");
  lugar.textContent = texto;
  lugar.hidden = false;
  clearTimeout(relogioRecado);
  if (duracaoMs > 0) relogioRecado = setTimeout(() => (lugar.hidden = true), duracaoMs);
}

function confirmar({ titulo, texto, botao }) {
  const dialogo = $("dialogo");
  $("dialogo-titulo").textContent = titulo;
  $("dialogo-texto").textContent = texto;
  $("dialogo-sim").textContent = botao;
  return new Promise((resolver) => {
    dialogo.addEventListener("close", () => resolver(dialogo.returnValue === "sim"), { once: true });
    dialogo.returnValue = "";
    dialogo.showModal();
  });
}

function criar(tag, classe, texto) {
  const elemento = document.createElement(tag);
  if (classe) elemento.className = classe;
  if (texto !== undefined) elemento.textContent = texto;
  return elemento;
}

montarCampos();
ligarEventos();
iniciar();
