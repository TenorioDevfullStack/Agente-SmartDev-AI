# SmartDev AI

Agentes de IA para o seu negócio.

Landing page em português para apresentar serviços de criação de agentes de inteligência artificial para WhatsApp. Inclui layout responsivo, benefícios, processo de criação, perguntas frequentes, demonstração interativa e contatos comerciais.

## Executar localmente

O projeto usa HTML, CSS e JavaScript, sem dependências ou etapa de compilação.

Com Python 3 instalado, execute na raiz do repositório:

```bash
python3 -m http.server 8080 --directory dist
```

Abra http://localhost:8080 no navegador.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `dist/index.html` | Página, metadados, navegação e contatos |
| `dist/styles.css` | Identidade visual e layout responsivo |
| `dist/script.js` | Menu, demonstração simulada e links do WhatsApp |
| `dist/site-config.js` | Número comercial e mensagem inicial do WhatsApp |
| `dist/favicon.svg` | Ícone da SmartDev AI |
| `dist/assets/emerald-ribbon.webp` | Imagem da seção inicial |
| `.openai/hosting.json` | Identificação da publicação existente no Sites |

## Contatos

- E-mail de suporte: suporte@smartdevai.com.br
- WhatsApp: +55 (11) 96637-3319
- Número usado nos links: `5511966373319`

Os links de contato também estão no HTML para funcionar sem JavaScript. Ao alterar o número ou a mensagem, mantenha o HTML e `dist/site-config.js` alinhados.

## Demonstração

A conversa apresentada na página usa respostas predeterminadas para ilustrar fluxos de atendimento e vendas. Ela não está conectada a um agente real nem envia mensagens. Os botões comerciais abrem o WhatsApp com uma mensagem preparada para o visitante enviar.

## Publicação

Publique o conteúdo da pasta `dist` na raiz do domínio. Os caminhos dos arquivos estáticos começam com `/`.

A configuração do Sites foi preservada. Este envio ao GitHub contém o código da página; não configura publicação automática nem o domínio personalizado.
