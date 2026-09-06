# SCRIPTORIA

Ecossistema agêntico pedagógico para apoio à escrita, leitura, feedback, autonomia e decisão docente.

Versão atual: **v7 — Ciclos de Aprendizagem Adaptativos**.

## Estrutura

- `index.html` — aplicação web SCRIPTORIA.
- `netlify/functions/agent.mjs` — backend serverless dos agentes.
- `netlify.toml` — configuração e rota `/api/agent`.

## Publicação no Netlify

Ligar este repositório ao Netlify e configurar a variável de ambiente `OPENAI_API_KEY` no painel do Netlify. A chave nunca deve ser colocada no repositório.

Opcionalmente, definir `OPENAI_MODEL`.

Conceção pedagógica: Ulisses Mota · Desenvolvimento com apoio de IA: ChatGPT / OpenAI.
