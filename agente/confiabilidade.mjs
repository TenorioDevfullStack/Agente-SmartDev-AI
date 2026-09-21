export class AtendimentoAssumido extends Error {}

export function esperaGroq(err, tentativa, agora = Date.now()) {
  const header = err.response?.headers?.['retry-after'];
  if (header != null) {
    const segundos = Number(header);
    if (Number.isFinite(segundos) && segundos >= 0) return segundos * 1000 + 250;
    const data = Date.parse(header);
    if (Number.isFinite(data)) return Math.max(0, data - agora) + 250;
  }
  const msg = err.response?.data?.error?.message || '';
  const match = msg.match(/try again in\s+([\d.]+)s/i);
  return match ? Number(match[1]) * 1000 + 250 : Math.min(30000, 2000 * 2 ** tentativa);
}

// Uma fila compartilhada por todas as conversas neste processo.
export function criarFilaGroq({ dormir = ms => new Promise(r => setTimeout(r, ms)), agora = Date.now } = {}) {
  let fila = Promise.resolve();
  let bloqueadoAte = 0;
  return async (chamar, estado = async () => {}, verificar = async () => {}) => {
    const anterior = fila;
    let liberar;
    fila = new Promise(r => { liberar = r; });
    try {
      await estado({ fase: 'fila' });
      await anterior;
      for (let tentativa = 0; ; tentativa++) {
        await verificar();
        if (bloqueadoAte > agora()) {
          // Limites diários não prendem a fila por horas.
          if (bloqueadoAte - agora() > 120000) throw new Error('Limite da IA indisponível por mais de dois minutos.');
          await estado({ fase: 'aguardando', ate: new Date(bloqueadoAte).toISOString(), tentativa });
          while (bloqueadoAte > agora()) {
            await dormir(Math.min(1000, bloqueadoAte - agora()));
            await verificar();
          }
        }
        await estado({ fase: 'gerando', tentativa });
        try { return await chamar(); }
        catch (err) {
          if (err.response?.status !== 429) throw err;
          bloqueadoAte = Math.max(bloqueadoAte, agora() + esperaGroq(err, tentativa, agora()));
          if (tentativa >= 3) throw err;
        }
      }
    } finally { liberar(); }
  };
}

export function criarFilaContatos() {
  const filas = new Map();
  return (numero, tarefa) => {
    const atual = (filas.get(numero) || Promise.resolve()).catch(() => {}).then(tarefa);
    filas.set(numero, atual);
    return atual.finally(() => { if (filas.get(numero) === atual) filas.delete(numero); });
  };
}
