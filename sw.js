// Service worker: guarda os arquivos do app para abrir sem internet e envia a fila em segundo plano.
import { criarFila } from "./fila.js";
import { enviarFila } from "./envio.js";

// Aumente a cada mudança em qualquer arquivo do app (inclusive config.js): é assim que os
// celulares percebem a versão nova e mostram "Nova versão disponível".
const VERSAO = "8";
const CACHE = `manutencao-${VERSAO}`;
const ARQUIVOS = [
  "./",
  "index.html",
  "estilo.css",
  "app.js",
  "campos.js",
  "config.js",
  "envio.js",
  "fila.js",
  "fotos.js",
  "regras.js",
  "manifest.webmanifest",
  "icones/icone-192.png",
  "icones/icone-512.png",
  "icones/icone-maskable-512.png",
  "icones/marca.png",
];
const ETIQUETA_SYNC = "enviar-fila";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ARQUIVOS.map((arquivo) => new Request(arquivo, { cache: "reload" })));
    })()
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => nome.startsWith("manutencao-") && nome !== CACHE).map((nome) => caches.delete(nome)));
      await self.clients.claim();
    })()
  );
});

// A página pede para a versão nova assumir quando o técnico toca em "atualizar".
self.addEventListener("message", (evento) => {
  if (evento.data === "ativar") self.skipWaiting();
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  const endereco = new URL(pedido.url);
  // Envios para o Apps Script (outro endereço) nunca passam pelo cache.
  if (pedido.method !== "GET" || endereco.origin !== self.location.origin) return;
  if (pedido.mode === "navigate") {
    evento.respondWith(caches.match("index.html", { cacheName: CACHE }).then((resposta) => resposta || fetch(pedido)));
    return;
  }
  evento.respondWith(caches.match(pedido, { cacheName: CACHE, ignoreSearch: true }).then((resposta) => resposta || fetch(pedido)));
});

// Background Sync: o Chrome do Android chama isto quando a internet volta, mesmo com o app fechado.
self.addEventListener("sync", (evento) => {
  if (evento.tag !== ETIQUETA_SYNC) return;
  evento.waitUntil(
    (async () => {
      const canal = new BroadcastChannel("manutencao");
      try {
        const resultado = await enviarFila({ fila: criarFila(), avisar: () => canal.postMessage("mudou") });
        // Falhou por conexão, ou outro envio segurava a fila (talvez um app fechado no meio):
        // rejeitar faz o Chrome tentar de novo mais tarde.
        if (resultado.situacao === "tentar_depois" || resultado.situacao === "ocupado") {
          throw new Error(resultado.mensagem || resultado.situacao);
        }
      } finally {
        canal.close();
      }
    })()
  );
});
