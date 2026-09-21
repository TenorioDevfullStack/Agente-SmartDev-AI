// Evolution API 2.3.7: /template/find e /message/sendTemplate para WHATSAPP-BUSINESS.
export function criarTransporteProspeccao({ http, url, instance, apiKey, registrarId, pendentes, permitirBaileys = false, textoBaileys = '' }) {
  const config = { headers: { apikey: apiKey }, timeout: 15000 };
  async function validarConexao() {
    const { data } = await http.get(`${url}/instance/fetchInstances`, { ...config, params: { instanceName: instance } });
    const instancias = Array.isArray(data) ? data : [];
    const atual = instancias.find(i => (i.name || i.instance?.instanceName) === instance);
    const integration = atual?.integration || atual?.instance?.integration;
    if (integration !== 'WHATSAPP-BUSINESS' && !(permitirBaileys && integration === 'WHATSAPP-BAILEYS')) throw new Error('API oficial necessária ou permissão explícita para Evolution/Baileys');
    return integration;
  }
  async function listar() {
    const integration = await validarConexao();
    if (integration === 'WHATSAPP-BAILEYS') {
      if (!textoBaileys.trim()) throw new Error('Defina PROSPECCAO_MODELO_TEXTO para usar Baileys.');
      return [{ nome: 'prospeccao_baileys', idioma: 'pt_BR', texto: textoBaileys.trim(), parametroEmpresa: textoBaileys.includes('{{1}}'), naoOficial: true }];
    }
    const resposta = await http.get(`${url}/template/find/${encodeURIComponent(instance)}`, config);
    const modelos = Array.isArray(resposta.data) ? resposta.data : resposta.data?.data;
    if (!Array.isArray(modelos)) throw new Error('Resposta de modelos inválida');
    return modelos.filter(t => t.status === 'APPROVED' && t.category === 'MARKETING').flatMap(t => {
      const componentes = t.components || [];
      const body = componentes.find(c => c.type === 'BODY');
      // Primeira versão: texto e rodapé, sem mídia/botões; {{1}} opcional = empresa.
      if (!body?.text || componentes.some(c => !['BODY', 'FOOTER'].includes(c.type))) return [];
      const variaveis = body.text.match(/\{\{.*?\}\}/g) || [];
      if (variaveis.some(v => v !== '{{1}}')) return [];
      const rodape = componentes.find(c => c.type === 'FOOTER')?.text;
      return [{ nome: t.name, idioma: t.language, texto: body.text + (rodape ? `\n${rodape}` : ''), parametroEmpresa: variaveis.length > 0 }];
    });
  }
  async function modelo(nome, idioma) {
    const m = (await listar()).find(m => m.nome === nome && m.idioma === idioma);
    if (!m) throw new Error('Modelo aprovado não encontrado');
    return m;
  }
  async function enviar(numero, m, empresa) {
    let liberar;
    const promise = new Promise(r => { liberar = r; });
    const conjunto = pendentes.get(numero) || new Set(); conjunto.add(promise); pendentes.set(numero, conjunto);
    try {
      const naoOficial = Boolean(m.naoOficial);
      const body = naoOficial
        ? { number: numero, text: m.texto.replaceAll('{{1}}', empresa) }
        : { number: numero, name: m.nome, language: m.idioma, components: m.parametroEmpresa ? [{ type: 'body', parameters: [{ type: 'text', text: empresa }] }] : [] };
      const { data } = await http.post(`${url}/message/${naoOficial ? 'sendText' : 'sendTemplate'}/${encodeURIComponent(instance)}`, body, { ...config, timeout: 30000 });
      const id = data?.key?.id || data?.messages?.[0]?.id;
      if (!id) throw new Error('Sem confirmação');
      await registrarId(numero, id);
      return { id, texto: m.texto.replaceAll('{{1}}', empresa), naoOficial };
    } finally { liberar(); conjunto.delete(promise); if (!conjunto.size) pendentes.delete(numero); }
  }
  return { listar, modelo, enviar, validarConexao };
}
