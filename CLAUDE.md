# Agent Architecture & Clean Code Guidelines (Node.js/ESM)

You are an expert software architect specializing in AI Agents built with Node.js. When refactoring or expanding this codebase, you must strictly adhere to the rules below. All files must use EcmaScript Modules (`.mjs` extension).

## 0. Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js 18+, ESM, top-level `await` |
| HTTP | `node:http` puro — sem Express/Fastify |
| Embedding | `@huggingface/transformers` 4.3.2 · `Xenova/multilingual-e5-small` · cpu · q4 · 384 dims |
| Geração | Ollama `/api/chat` via `fetch` · `qwen2.5:3b` · `temperature: 0` |
| Chat | Telegram Bot API via `fetch`, long polling |
| Testes | `node --test` nativo |

Dependência de produção: uma só. Adicionar outra exige justificativa no commit.

Dois modelos distintos, nunca confunda: o de *embedding* roda no processo e
**busca**; o de *geração* roda no Ollama e **escreve**.

Config por variável de ambiente, tudo com default: `PORT`, `OLLAMA_URL`,
`OLLAMA_MODEL`, `TELEGRAM_BOT_TOKEN`. Nunca hardcode segredo, nem para teste
rápido: token de bot é commit vazado.

## 1. Code Style

- **Function Length:** 4-20 lines. Split into smaller functions if it exceeds this range.
- **File Length:** Under 500 lines. Split strictly by responsibility.
- **Single Responsibility (SRP):** One thing per function, one responsibility per module.
- **Naming Conventions:** Specific and unique.
  * ABSOLUTELY FORBIDDEN words in names: `data`, `handler`, `Manager`.
  * Prefer domain-specific names that return <5 grep hits in the codebase.
  * Nomeie o papel do modelo, nunca o fornecedor: `embedQuestion`, não `gemma`.
- **Type Safety:** Explicit types everywhere (JSDoc or TypeScript equivalents). No `any`, no generic untyped Objects, no untyped functions.
  * Resposta de LLM e de API externa é `unknown` até ser validada. Cheque o
    formato antes de usar — `completion.message.content` pode não existir.
- **DRY (Don't Repeat Yourself):** No code duplication. Extract shared logic into a function/module immediately.
- **Control Flow:** Use early returns over nested `if` statements. Maximum of 2 levels of indentation allowed.
- **Error Handling:** Exception messages must include the offending value and the expected shape/type.
  * Erro de serviço externo diz como verificar: `Ollama respondeu 404 — o
    container está de pé? (curl $OLLAMA_URL/api/tags)`.

## 2. Comments & Documentation

**Override deste repositório:** arquivo `.mjs` versionado não leva comentário
nem JSDoc. A versão explicada vive ao lado como `*.comentado.mjs`, com o código
idêntico, e fica no `.gitignore`. As regras abaixo valem para esses arquivos,
para Markdown e para as mensagens de commit.

- **Persistence:** Keep existing comments. Do not strip them during refactoring — they carry intent and provenance.
- **Philosophy:** Write WHY, not WHAT. (e.g., Skip `// increment counter` above `i++`).
- **Public APIs:** JSDoc / Docstrings on public functions are required and must include: Intent + exactly one usage example.
- **Traceability:** Reference issue numbers / commit SHAs when a line exists because of a specific bug or upstream constraint.
  * Toda regra de prompt nasceu de um bug observado. Registre qual, ou alguém
    "simplifica" a regra e o bug volta.

## 3. Agent, Vector DB & Skills Architecture

- **LLM & Vector DB Decoupling:** The main execution loop or interface must never call Ollama or the Vector Database directly. All LLM and embedding/retrieval interactions must be encapsulated in explicit Client or Repository classes.
- **Future-Proof Storage:** Anticipate shifting from in-memory document stores to external Vector Database APIs. The retrieval abstraction must decouple the underlying storage engine from the agent.
- **Skill Pattern:** Every Agent Skill (tool) must be an isolated, single-responsibility module inside the `/skills` directory using `.mjs`.
- **Skill Contract:** Every skill must explicitly define its schema (name, description, explicit parameter types) so the Agent can invoke it safely.
- **State Management:** Thread history, context, and chat memory must be managed by a dedicated class abstraction, never via global variables or untyped arrays.
- **Prompt como artefato:** o system prompt é versionado num módulo próprio,
  nunca inline no meio da chamada HTTP. Trocar de persona não pode exigir
  tocar no client.
- **Limpeza é código, não prompt:** sujeira do dado (marcadores `[cite: N]` do
  PDF de origem) se remove em função testável. Prompt não limpa dado de forma
  confiável.
- **Superfícies são plugues:** HTTP e Telegram são entradas intercambiáveis
  para o mesmo agente. Nenhuma lógica de RAG pode viver dentro de um loop de
  polling.

## 4. Tests

- **Execution:** Tests must run with a single command: `node --test` (native Node.js test runner).
- **Coverage:** Every new function gets a test. Bug fixes get a regression test.
- **Isolation:** Mock external I/O (Ollama API HTTP requests, Vector DB API calls, filesystem) with named fake/mock classes, NOT inline stubs.
- **F.I.R.S.T Principles:** Tests must be Fast, Independent, Repeatable, Self-validating, and Timely.
- **Invariante do cosseno:** a similaridade só é um produto escalar porque os
  embeddings saem com `normalize: true`. Asserte isso — sem o flag a função
  fica errada em silêncio.
- **Bateria de prompt não é teste unitário:** exige modelo real e varia entre
  máquinas. Mantenha como script à parte e nunca trave CI nela. Ela precisa
  cobrir os dois lados: pergunta coberta pela base deve ser respondida,
  pergunta não coberta deve cair na frase de escape.
