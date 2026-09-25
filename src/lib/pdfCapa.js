// Gera uma imagem da primeira página de um PDF, pra usar como capa/fotinho
// do e-book na Biblioteca — sem a nutri precisar subir uma foto separada.
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const LARGURA_ALVO = 480;

export async function gerarCapaPdf(arquivo) {
  const buffer = await arquivo.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pagina = await pdf.getPage(1);
  const viewportBase = pagina.getViewport({ scale: 1 });
  const escala = LARGURA_ALVO / viewportBase.width;
  const viewport = pagina.getViewport({ scale: escala });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const contexto = canvas.getContext('2d');
  await pagina.render({ canvasContext: contexto, viewport }).promise;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  return blob;
}
