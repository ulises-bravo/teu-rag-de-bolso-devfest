# Teu RAG de bolso — DevFest

Um servidor HTTP de ~100 linhas que responde perguntas sobre o FAQ do iiLEX
usando busca semântica. Sem banco de dados, sem API paga, sem framework:
Node puro + um modelo de embedding rodando local na CPU.

RAG = *Retrieval-Augmented Generation*. Esta v1 faz só a parte do
**Retrieval**: dada uma pergunta, encontra o documento mais parecido. Não há
geração de texto por LLM ainda — a resposta é o próprio documento recuperado.

## Pré-requisitos

- **Node.js 18 ou superior** (`node -v` para conferir)
- ~1,2 GB de disco livre (776 MB de dependências + 397 MB de modelo)
- No Windows: rodar os comandos pelo **Git Bash**, não pelo PowerShell
  (o `prepare-model.sh` é um script `sh`)

## Instalação

Rode os três na ordem. **A ordem importa**: o modelo é baixado para dentro de
`node_modules/`, então o `npm install` tem que vir primeiro.

```bash
git clone https://github.com/ulises-bravo/teu-rag-de-bolso-devfest.git
cd teu-rag-de-bolso-devfest

npm install              # ~3 min
npm run prepare-model    # ~4 min — baixa o modelo (397 MB)
npm start                # ~7 s
```

Quando aparecer isto, está pronto:

```
Carregando o modelo de embedding (1a execucao baixa ~397 MB)...
Gerando embeddings para os documentos de FAQ...
4 documentos indexados, vetores de 384 dimensões.
v1 ouvindo em http://localhost:3000/query
```

> **Faça o `npm run prepare-model` em casa, antes do workshop.** Ele baixa
> 397 MB. Vinte pessoas baixando isso ao mesmo tempo no wi-fi da sala não vai
> terminar.

## Usando

Deixe o `npm start` rodando e abra **outro terminal**:

```bash
curl -s -X POST http://localhost:3000/query \
  -H 'Content-Type: application/json' \
  -d '{"query":"O sistema busca por CNPJ?"}' | jq
```

Resposta:

```json
{
  "id": "doc_003",
  "score": 0.8996,
  "documents": "Pergunta do cliente: 'O sistema realiza o monitoramento e a busca por número de CNPJ?' | Resposta: Sim. Além da captura por OAB e nome das partes, o iiLEX permite..."
}
```

Sem o `jq` instalado, tire o ` | jq` do final.

### Perguntas para testar

Nenhuma delas repete as palavras exatas do documento — é isso que mostra que a
busca é semântica, e não um `LIKE %texto%`:

| Pergunta | Documento esperado | Score |
|---|---|---|
| `O sistema busca por CNPJ?` | doc_003 | 0,8996 |
| `Vocês leem publicações do DJEN?` | doc_001 | 0,9068 |
| `Tem IA para resumir publicação?` | doc_004 | 0,8898 |
| `Como classifica os prazos automaticamente?` | doc_002 | 0,8832 |

Repare que os scores ficam todos entre 0,88 e 0,91 — **pouco separados**. O que
decide é qual é o *maior*, não o valor absoluto. Um limiar do tipo "rejeitar se
score < 0,8" não funcionaria aqui.

## Como funciona

```
          ┌─ no boot, uma vez ────────────────────────┐
          │  4 documentos ──> modelo ──> 4 vetores    │
          │                              (384 dims)   │
          └───────────────────────────────────────────┘

          ┌─ a cada requisição ───────────────────────┐
          │  pergunta ──> modelo ──> vetor            │
          │                            │              │
          │                            v              │
          │           compara com os 4 vetores        │
          │           (similaridade de cosseno)       │
          │                            │              │
          │                            v              │
          │                 documento de maior score  │
          └───────────────────────────────────────────┘
```

O truque é transformar texto em vetor de números (*embedding*). Textos com
sentido parecido geram vetores que apontam para direções parecidas. Comparar
sentido vira, então, comparar vetores — e isso é só aritmética.

O modelo é o `Xenova/multilingual-e5-small`, multilíngue (entende português),
quantizado em 4 bits para rodar leve na CPU.

## O arquivo

`faq-rag-v1-http-server.mjs` — o servidor inteiro, ~100 linhas.

Para rodar duas instâncias ao mesmo tempo, use portas diferentes:

```bash
npm start                                     # porta 3000
PORT=3010 node faq-rag-v1-http-server.mjs     # porta 3010
```

## Problemas comuns

**`A porta 3000 ja esta em uso`**
Outro processo está na 3000. Use outra: `PORT=3001 npm start` (e troque a porta
no `curl` também).

**`Falha ao carregar o modelo (tentativa 1/5)`**
O download pelo Node caiu. Cada tentativa recomeça os 380 MB do zero, então não
espere — interrompa com `Ctrl+C` e rode `npm run prepare-model`, que usa `curl`
com retomada e continua de onde parou.

**O `curl` devolve `Failed to connect to localhost port 3000`**
O servidor não está rodando, ou ainda está carregando. Espere a linha
`v1 ouvindo em...` aparecer no outro terminal.

**`Campo "query" obrigatorio`**
Faltou o campo no JSON. O corpo precisa ser `{"query":"sua pergunta"}`.

**O `npm run prepare-model` falha em tudo**
A rede está bloqueando o `huggingface.co`. Nesse caso peça o diretório
`node_modules/@huggingface/transformers/.cache/` (397 MB) de quem já baixou e
copie para o mesmo caminho na sua máquina — aí roda offline.

## Exercícios

1. Adicione um 5º documento ao array `iilexFaqDocuments` e veja se ele é
   encontrado. (Dica: reinicie o servidor — o índice é construído no boot.)
2. Faça o endpoint devolver os **3** documentos mais relevantes, não só o
   primeiro.
3. Remova o `normalize: true` do embedding e veja a busca degradar. Por quê?
   (A resposta está no comentário do `cosineSimilarity`.)
4. Rejeite respostas ruins: se o melhor score for menor que um limiar, devolva
   "não sei". Qual limiar funciona, dado que todos os scores ficam perto de 0,89?
