# Teu RAG de bolso — DevFest

Um servidor HTTP de ~100 linhas que responde perguntas sobre o FAQ do iiLEX
usando busca semântica. Sem banco de dados, sem API paga, sem framework:
Node puro + um modelo de embedding rodando local na CPU.

RAG = *Retrieval-Augmented Generation*. São duas metades, e o workshop
constrói uma por vez:

| | O que faz | Onde está |
|---|---|---|
| **v1** — *Retrieval* | acha o documento mais parecido com a pergunta | esta branch (`main`) |
| **v2** — *+ Generation* | entrega o documento a um LLM, que responde como a vendedora Dani, no Telegram | branch `v2` |

Mesmo na v1 você precisa instalar o Ollama em casa (passo 2 abaixo) — ele só é
usado na v2, mas é o download mais pesado e não dá para deixar para a hora.

## Pré-requisitos

- **Node.js 18 ou superior** (`node -v` para conferir)
- **Ollama** instalado (passo 2 abaixo) — a v1 ainda não usa, mas a v2 usa, e
  o download é grande demais para deixar para a hora da palestra
- ~3,5 GB de disco livre no total
- No Windows: rodar os comandos pelo **Git Bash**, não pelo PowerShell
  (o `prepare-model.sh` é um script `sh`)

---

# Antes de vir — faça em casa!

São ~3,5 GB de download somando tudo. **Vinte pessoas baixando isso no wi-fi da
sala não vai terminar.** Os quatro passos abaixo, em casa, e você chega pronto.

## 1 — Node.js 18 ou superior

Confira primeiro — pode ser que já tenha:

```bash
node -v
```

Se respondeu `v18` ou maior, pule para o passo 2. Se o comando não existe ou a
versão é menor, escolha **um** caminho:

| Ambiente | Comando |
|---|---|
| **macOS / Linux (Homebrew)** | `brew install node` |
| **Arch, Manjaro, EndeavourOS** | `sudo pacman -S nodejs npm` |
| **Windows (winget)** | `winget install OpenJS.NodeJS.LTS` |
| **Debian / Ubuntu / Mint** | NodeSource, abaixo |
| **Qualquer sistema (nvm)** | nvm, abaixo |
| **Instalador gráfico** | [nodejs.org](https://nodejs.org) |

```bash
brew install node
```

```bash
sudo pacman -S nodejs npm
```

```bash
winget install OpenJS.NodeJS.LTS
```

**Debian, Ubuntu e derivados.** Não use `sudo apt install nodejs` direto: o
repositório padrão entrega uma versão antiga demais em boa parte das versões
(no Ubuntu 22.04 ainda vem o Node 12, que não roda este projeto). Use o
repositório oficial do NodeSource:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs
```

**nvm — funciona em qualquer Linux ou macOS**, e é o melhor caminho se você já
tem outro Node instalado e não quer mexer nele:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
```

Feche e reabra o terminal, depois:

```bash
nvm install 22
```

**Confirme no fim, seja qual for o caminho:**

```bash
node -v && npm -v
```

Os dois precisam responder, e o `node` tem que ser `v18` ou maior.

## 2 — Instalar o Ollama

O Ollama roda o LLM na sua máquina. A **v1 não precisa dele**, mas a **v2 sim**
— e é o download mais pesado, então deixe resolvido agora. Escolha **um**
caminho:

| Ambiente | Comando |
|---|---|
| **macOS / Linux (Homebrew)** | `brew install ollama` |
| **Arch, Manjaro, EndeavourOS** | `sudo pacman -S ollama` |
| **Windows (winget)** | `winget install Ollama.Ollama` |
| **Linux (qualquer distro)** | `curl -fsSL https://ollama.com/install.sh \| sh` |
| **macOS / Windows (app)** | baixe em [ollama.com/download](https://ollama.com/download) |

```bash
brew install ollama
```

```bash
sudo pacman -S ollama
```

```bash
winget install Ollama.Ollama
```

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

> **Dois caminhos que NÃO funcionam**, e aparecem em tutoriais por aí:
> - `npm install ollama` instala a **biblioteca JavaScript** de cliente, não o
>   servidor. Você fica com um pacote que não tem o que chamar.
> - `apt install ollama` não existe: não há pacote oficial para Debian/Ubuntu.
>   O `install.sh` baixa um tarball; o `apt` que aparece dentro dele é só para
>   o `zstd` e para drivers da NVIDIA.
>
> No Arch o `yay -S ollama` também funciona, mas é desnecessário: o pacote está
> no repositório oficial `extra`, então o `pacman` resolve.

**Subir o serviço.** Homebrew e pacman não iniciam sozinhos:

```bash
ollama serve
```

Deixe esse terminal aberto. Com o instalador `curl`, o app do macOS ou o
winget, o serviço já sobe sozinho.

**Confirmar que está no ar:**

```bash
curl http://localhost:11434/api/tags
```

Tem que responder um JSON, mesmo que com a lista de modelos vazia. Se der
`Connection refused`, o serviço não está rodando.

## 3 — Baixar o modelo de geração

```bash
ollama pull qwen2.5:3b
```

1,9 GB. É o modelo que vai escrever as respostas na v2.

> **Por que não um mais novo?** O `qwen3:4b` existe e é mais recente, mas é um
> modelo de *raciocínio*: gasta tokens "pensando" antes de responder, e na CPU
> fica bem mais lento. Para workshop, o `qwen2.5:3b` é o equilíbrio certo.

## 4 — Clonar e preparar o projeto

**A ordem importa**: o modelo de embedding é baixado para dentro de
`node_modules/`, então o `npm install` tem que vir primeiro.

```bash
git clone https://github.com/ulises-bravo/teu-rag-de-bolso-devfest.git
```

```bash
cd teu-rag-de-bolso-devfest
```

```bash
npm install
```

```bash
npm run prepare-model
```

O `prepare-model` baixa o modelo de **embedding** (397 MB) — outro modelo,
diferente do de geração do passo 3. Um transforma texto em vetor para buscar; o
outro escreve texto. Usa `curl` com retomada, então se a conexão cair ele
continua de onde parou.

## Checklist

```bash
node -v && ollama list && ls node_modules/@huggingface/transformers/.cache
```

Se os três responderem, você está pronto.

---

# Rodando a v1

```bash
npm start
```

Em ~7 segundos:

```
Carregando o modelo de embedding (1a execucao baixa ~397 MB)...
Gerando embeddings para os documentos de FAQ...
4 documentos indexados, vetores de 384 dimensões.
v1 ouvindo em http://localhost:3000/query
```

A v1 **não chama o Ollama** — ela só faz a busca e devolve o documento. O LLM
entra na v2.

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
