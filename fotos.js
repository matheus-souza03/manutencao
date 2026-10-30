// Redução das fotos no celular, antes de entrarem na fila (lado maior 1600 px, JPEG 0,8).

export const LADO_MAXIMO = 1600;
export const QUALIDADE_JPEG = 0.8;

/** Tamanho final mantendo a proporção; fotos menores ficam como estão. */
export function tamanhoReduzido(largura, altura, ladoMaximo = LADO_MAXIMO) {
  const maior = Math.max(largura, altura);
  if (maior <= ladoMaximo) return { largura: largura, altura: altura };
  const escala = ladoMaximo / maior;
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

/** Lê a foto escolhida (câmera ou galeria), já de pé, e devolve um JPEG reduzido (Blob). */
export async function reduzirFoto(arquivo) {
  const imagem = await abrirImagem(arquivo);
  try {
    const { largura, altura } = tamanhoReduzido(imagem.width, imagem.height);
    const tela = document.createElement("canvas");
    tela.width = largura;
    tela.height = altura;
    tela.getContext("2d").drawImage(imagem.fonte, 0, 0, largura, altura);
    const blob = await new Promise((resolver) => tela.toBlob(resolver, "image/jpeg", QUALIDADE_JPEG));
    if (!blob) throw new Error("não foi possível gerar o JPEG");
    return blob;
  } finally {
    imagem.fechar();
  }
}

async function abrirImagem(arquivo) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
      return { fonte: bitmap, width: bitmap.width, height: bitmap.height, fechar: () => bitmap.close() };
    } catch (erro) {
      // segue para a alternativa com <img>
    }
  }
  const endereco = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = endereco;
    await img.decode(); // o navegador já aplica a orientação EXIF no <img>
    return { fonte: img, width: img.naturalWidth, height: img.naturalHeight, fechar: () => URL.revokeObjectURL(endereco) };
  } catch (erro) {
    URL.revokeObjectURL(endereco);
    throw erro;
  }
}
