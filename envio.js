// Envio da fila para o Apps Script: um item por vez, na ordem em que foram registrados.
// Roda na página e no service worker; a trava na fila impede dois envios ao mesmo tempo.
import { URL_APPS_SCRIPT } from "./config.js";
import {
  SITUACAO,
  aplicarResultado,
  bytesParaBase64,
  enviadosParaLimpar,
  interpretarResposta,
  lerUrl,
  montarEnvio,
  proximoParaEnviar,
} from "./regras.js";

export const PRAZO_TRAVA_MS = 3 * 60 * 1000;
export const TEMPO_LIMITE_MS = 2 * 60 * 1000; // fotos em internet fraca demoram

/**
 * Envia o que estiver na fila até acabar, parar num erro ou faltar conexão.
 * Devolve {situacao: "vazio" | "parado" | "tentar_depois" | "ocupado", enviados, mensagem}.
 * `avisar()` é chamado a cada mudança, para a tela se atualizar.
 */
export async function enviarFila({
  fila,
  url = URL_APPS_SCRIPT,
  buscar = (...args) => fetch(...args),
  agora = () => Date.now(),
  avisar = () => {},
  dono = novoDono(),
}) {
  if (!(await fila.pegarTrava(dono, agora(), PRAZO_TRAVA_MS))) {
    return { situacao: "ocupado", enviados: 0 };
  }
  let enviados = 0;
  try {
    // Com a trava na mão, ninguém está enviando: "enviando" que ficou para trás (app fechado no meio) volta a pendente.
    const itens = await fila.listar();
    for (const item of itens.filter((i) => i.situacao === SITUACAO.ENVIANDO)) {
      await fila.atualizarSe(item.id, (i) => i.situacao === SITUACAO.ENVIANDO, { situacao: SITUACAO.PENDENTE });
    }
    const antigos = enviadosParaLimpar(itens, agora());
    if (antigos.length > 0) {
      await fila.apagarVarios(antigos);
      avisar();
    }

    for (;;) {
      const { item, parado } = proximoParaEnviar(await fila.listar());
      if (!item) return { situacao: "vazio", enviados: enviados };
      if (parado) return { situacao: "parado", enviados: enviados, mensagem: item.ultimo_erro };

      await fila.pegarTrava(dono, agora(), PRAZO_TRAVA_MS); // renova o prazo
      const marcado = await fila.atualizarSe(item.id, (i) => i.situacao === SITUACAO.PENDENTE, { situacao: SITUACAO.ENVIANDO });
      if (!marcado.ok) continue; // foi apagado ou corrigido agora mesmo: olha a fila de novo
      avisar();

      const resultado = await postar(url, marcado.item, buscar);
      await fila.atualizarSe(item.id, () => true, (atual) => aplicarResultado(atual, resultado, agora()));
      avisar();

      if (resultado.tipo === "enviado") {
        enviados += 1;
        continue;
      }
      return {
        situacao: resultado.tipo === "erro" ? "parado" : "tentar_depois",
        enviados: enviados,
        mensagem: resultado.mensagem,
      };
    }
  } finally {
    await fila.soltarTrava(dono);
  }
}

async function postar(configurado, item, buscar) {
  const url = lerUrl(configurado);
  if (!url) {
    return {
      tipo: "tentar_depois",
      mensagem: "O app não sabe para onde enviar (falta a URL em config.js). Avise o escritório.",
    };
  }
  let corpo;
  try {
    const [antes, depois] = await Promise.all([paraBase64(item.foto_antes), paraBase64(item.foto_depois)]);
    corpo = JSON.stringify(montarEnvio(item, antes, depois));
  } catch (erro) {
    return { tipo: "erro", mensagem: "As fotos deste lançamento se perderam no celular. Corrija escolhendo as fotos de novo." };
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TEMPO_LIMITE_MS);
  try {
    // text/plain evita a consulta prévia de CORS, que o Apps Script não atende. O fetch segue o redirecionamento.
    const resposta = await buscar(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: corpo,
      redirect: "follow",
      cache: "no-store",
      signal: controle.signal,
    });
    return interpretarResposta({ status: resposta.status, texto: await resposta.text() });
  } catch (erro) {
    return interpretarResposta({ erroRede: true, abortado: erro && erro.name === "AbortError" });
  } finally {
    clearTimeout(relogio);
  }
}

async function paraBase64(blob) {
  return bytesParaBase64(new Uint8Array(await blob.arrayBuffer()));
}

function novoDono() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
