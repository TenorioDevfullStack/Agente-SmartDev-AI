import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const normalizar = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s-]+/g, '_');
export function telefoneBR(value) {
  const texto = String(value ?? '').trim();
  if (!/^[+\d\s().-]+$/.test(texto)) return null;
  let n = texto.replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) n = '55' + n;
  return /^55[1-9]\d(?:[2-5]\d{7}|9\d{8})$/.test(n) ? n : null;
}

export function lerCSV(texto) {
  texto = texto.replace(/^\uFEFF/, '');
  const primeira = texto.split(/\r?\n/)[0];
  const sep = primeira.includes(';') ? ';' : primeira.includes('\t') ? '\t' : ',';
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c === '"') {
      if (aspas && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (aspas || !campo) aspas = !aspas;
      else throw new Error('Aspas inválidas no CSV.');
    } else if (!aspas && (c === sep || c === '\n' || c === '\r')) {
      linha.push(campo); campo = '';
      if (c !== sep) { linhas.push(linha); linha = []; if (c === '\r' && texto[i + 1] === '\n') i++; }
    } else campo += c;
    if (linhas.length > 1001 || linha.length > 50 || campo.length > 10000) throw new Error('Limite: 1.000 contatos, 50 colunas e 10.000 caracteres por célula.');
  }
  if (aspas) throw new Error('CSV com aspas não fechadas.');
  if (campo || linha.length) linhas.push([...linha, campo]);
  return linhas;
}

export function validarLinhas(linhas) {
  if (!Array.isArray(linhas) || linhas.length < 2 || linhas.length > 1001) throw new Error('Use cabeçalho e entre 1 e 1.000 contatos.');
  const cab = linhas[0].map(normalizar);
  const indice = (...nomes) => cab.findIndex(c => nomes.includes(c));
  const empresa = indice('empresa', 'clinica', 'nome', 'nome_fantasia');
  const telefone = indice('telefone', 'whatsapp', 'celular', 'numero', 'contato_publico', 'contato');
  if (empresa < 0 || telefone < 0) throw new Error('Inclua as colunas empresa e telefone (ou contato_publico).');
  const campo = (r, ...nomes) => String(r[indice(...nomes)] ?? '').trim().slice(0, 500);
  const vistos = new Set();
  return linhas.slice(1).filter(r => r.some(v => String(v ?? '').trim())).map((r, i) => {
    const nome = String(r[empresa] ?? '').trim().slice(0, 160);
    const original = String(r[telefone] ?? '').trim().slice(0, 200);
    const numero = telefoneBR(original);
    let erro = !nome ? 'Empresa não informada' : !numero ? 'Informe um único telefone brasileiro com DDD' : vistos.has(numero) ? 'Telefone repetido no arquivo' : '';
    if (numero) vistos.add(numero);
    return { linha: i + 2, empresa: nome, numero, telefoneOriginal: original, segmento: campo(r, 'segmento'), fonte: campo(r, 'fonte'), erro };
  });
}

export async function importarArquivo(nome, buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > 2 * 1024 * 1024) throw new Error('O arquivo deve ter até 2 MB.');
  if (!/\.(csv|xlsx)$/i.test(nome)) throw new Error('Use CSV ou Excel .xlsx. Para .xls, salve como .xlsx.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), { workerData: { nome, buffer }, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Arquivo muito complexo. Simplifique a planilha.')); }, 10000);
    worker.once('message', data => { clearTimeout(timer); worker.terminate(); data.erro ? reject(new Error(data.erro)) : resolve(data.linhas); });
    worker.once('error', () => { clearTimeout(timer); reject(new Error('Não foi possível ler o arquivo.')); });
    worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('Leitura interrompida. Verifique o arquivo.')); });
  });
}

if (!isMainThread && workerData?.buffer) {
  try {
    const buffer = Buffer.from(workerData.buffer); let linhas;
    if (/\.csv$/i.test(workerData.nome)) linhas = lerCSV(buffer.toString('utf8'));
    else {
      const { default: ExcelJS } = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount > 1001 || sheet.columnCount > 50) throw new Error('Use a primeira aba, até 1.000 contatos e 50 colunas.');
      linhas = [];
      sheet.eachRow(row => {
        const values = [];
        for (let i = 1; i <= sheet.columnCount; i++) {
          const cell = row.getCell(i);
          if (cell.value && typeof cell.value === 'object' && ('formula' in cell.value || 'sharedFormula' in cell.value)) throw new Error('Remova fórmulas: importe somente valores.');
          values.push(cell.text);
        }
        linhas.push(values);
      });
    }
    parentPort.postMessage({ linhas: validarLinhas(linhas) });
  } catch (err) { parentPort.postMessage({ erro: err.message }); }
}
