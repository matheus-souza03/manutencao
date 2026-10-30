// Fila de saída no celular (IndexedDB). Usada pela página e pelo service worker.
//
// Item: { id, ordem, registrado_em (ISO com fuso), criado_ms, campos: {...}, foto_antes: Blob,
//         foto_depois: Blob, situacao, tentativas, ultimo_erro, ultima_tentativa_ms, enviado_ms, linha }

const NOME_BANCO = "manutencao";
const VERSAO_BANCO = 1;
const ITENS = "itens";
const CONTROLE = "controle"; // trava de envio, próxima ordem, rascunho, sugestões

let conexao = null;

function abrir() {
  if (!conexao) {
    conexao = new Promise((resolver, rejeitar) => {
      const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
      pedido.onupgradeneeded = () => {
        const banco = pedido.result;
        if (!banco.objectStoreNames.contains(ITENS)) banco.createObjectStore(ITENS, { keyPath: "id" });
        if (!banco.objectStoreNames.contains(CONTROLE)) banco.createObjectStore(CONTROLE);
      };
      pedido.onsuccess = () => resolver(pedido.result);
      pedido.onerror = () => rejeitar(pedido.error);
    });
    conexao.catch(() => {
      conexao = null;
    });
  }
  return conexao;
}

function esperar(pedido) {
  return new Promise((resolver, rejeitar) => {
    pedido.onsuccess = () => resolver(pedido.result);
    pedido.onerror = () => rejeitar(pedido.error);
  });
}

/** Roda `trabalho(lojas)` numa transação e devolve o resultado quando ela termina gravada. */
async function transacao(nomes, modo, trabalho) {
  const banco = await abrir();
  return new Promise((resolver, rejeitar) => {
    const tx = banco.transaction(nomes, modo);
    const lojas = {};
    nomes.forEach((nome) => {
      lojas[nome] = tx.objectStore(nome);
    });
    let resultado;
    Promise.resolve()
      .then(() => trabalho(lojas))
      .then((valor) => {
        resultado = valor;
      })
      .catch((erro) => {
        try {
          tx.abort();
        } catch (e) {
          // já terminou
        }
        rejeitar(erro);
      });
    tx.oncomplete = () => resolver(resultado);
    tx.onerror = () => rejeitar(tx.error);
    tx.onabort = () => rejeitar(tx.error || new Error("transação cancelada"));
  });
}

/** Mesma interface da fila falsa usada nos testes (tests/fila_falsa.js). */
export function criarFila() {
  return {
    listar: () => transacao([ITENS], "readonly", (l) => esperar(l[ITENS].getAll())),

    obter: (id) => transacao([ITENS], "readonly", (l) => esperar(l[ITENS].get(id))),

    /** Acrescenta no fim da fila (a ordem vem de um contador, não do relógio). */
    adicionar: (item) =>
      transacao([ITENS, CONTROLE], "readwrite", async (l) => {
        const ordem = (await esperar(l[CONTROLE].get("proxima_ordem"))) || 1;
        l[CONTROLE].put(ordem + 1, "proxima_ordem");
        const novo = Object.assign({}, item, { ordem: ordem });
        l[ITENS].add(novo);
        return novo;
      }),

    /** Aplica `mudancas` só se `condicao(item)` for verdadeira. Devolve {ok, item}. */
    atualizarSe: (id, condicao, mudancas) =>
      transacao([ITENS], "readwrite", async (l) => {
        const item = await esperar(l[ITENS].get(id));
        if (!item || !condicao(item)) return { ok: false, item: item || null };
        const novo = Object.assign({}, item, typeof mudancas === "function" ? mudancas(item) : mudancas);
        l[ITENS].put(novo);
        return { ok: true, item: novo };
      }),

    apagarSe: (id, condicao) =>
      transacao([ITENS], "readwrite", async (l) => {
        const item = await esperar(l[ITENS].get(id));
        if (!item || !condicao(item)) return false;
        l[ITENS].delete(id);
        return true;
      }),

    apagarVarios: (ids) =>
      transacao([ITENS], "readwrite", (l) => {
        ids.forEach((id) => l[ITENS].delete(id));
      }),

    /** Trava com prazo, para a página e o service worker não enviarem ao mesmo tempo. */
    pegarTrava: (dono, agoraMs, prazoMs) =>
      transacao([CONTROLE], "readwrite", async (l) => {
        const trava = await esperar(l[CONTROLE].get("trava"));
        if (trava && trava.dono !== dono && trava.ate > agoraMs) return false;
        l[CONTROLE].put({ dono: dono, ate: agoraMs + prazoMs }, "trava");
        return true;
      }),

    soltarTrava: (dono) =>
      transacao([CONTROLE], "readwrite", async (l) => {
        const trava = await esperar(l[CONTROLE].get("trava"));
        if (trava && trava.dono === dono) l[CONTROLE].delete("trava");
      }),

    lerControle: (chave) => transacao([CONTROLE], "readonly", (l) => esperar(l[CONTROLE].get(chave))),

    gravarControle: (chave, valor) =>
      transacao([CONTROLE], "readwrite", (l) => {
        if (valor === null || valor === undefined) l[CONTROLE].delete(chave);
        else l[CONTROLE].put(valor, chave);
      }),
  };
}
