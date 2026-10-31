import http from 'node:http';
import {pipeline} from '@huggingface/transformers';

const FAQ_RAG_SERVER_PORT = Number(process.env.PORT ?? 3000);
const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen2.5:3b';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';

const iilexFaqDocuments = [
  {
    id: 'doc_001',
    text: "Pergunta do cliente: 'Vocês leem publicações do DJEN, notas de expediente ou variações semelhantes?' | Resposta: Sim. O iiLEX realiza o monitoramento e a captura automática de publicações nacionais nos diários oficiais e diários da justiça eletrônica (como o DJEN)[cite: 1, 3], acompanhando o nome das partes, variação nominal e registros de OAB[cite: 1, 5].",
  },
  {
    id: 'doc_002',
    text: "Pergunta do cliente: 'Como funciona a vinculação e a classificação automática das publicações capturadas?' | Resposta: O iiLEX vincula automaticamente as publicações aos processos cadastrados pelo número do CNJ[cite: 1, 2]. Além disso, possui a funcionalidade de classificador automático (varinha mágica), que lê o texto da publicação, identifica o tipo de decisão (ex: sentença cível) e gera os compromissos e prazos na agenda conforme as regras de antecedência do escritório[cite: 1, 2].",
  },
  {
    id: 'doc_003',
    text: "Pergunta do cliente: 'O sistema realiza o monitoramento e a busca por número de CNPJ?' | Resposta: Sim. Além da captura por OAB e nome das partes, o iiLEX permite realizar a captura automática de publicações nacionais e o acompanhamento de andamentos através do número de CNPJ da empresa[cite: 2, 3].",
  },
  {
    id: 'doc_004',
    text: "Pergunta do cliente: 'O iiLEX utiliza Inteligência Artificial para ler e resumir o conteúdo das publicações?' | Resposta: Sim. O sistema conta com recursos de inteligência artificial aplicados para a leitura e elaboração de resumos das publicações capturadas[cite: 2].",
  },
];

async function loadFeatureExtractorWithRetry(maxAttempts = 5) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
                device: 'cpu',
                dtype: 'q4',
            });
        } catch (loadError) {
            console.log(`Falha ao carregar o modelo (tentativa ${attempt}/${maxAttempts}): ${loadError.message}`);
            if (attempt === maxAttempts) {
                console.error('Nao foi possivel baixar o modelo. Rode: npm run prepare-model');
                process.exit(1);
            }
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}

console.log('Carregando o modelo de embedding (1a execucao baixa ~397 MB)...');
const gemmaFeatureExtrator = await loadFeatureExtractorWithRetry();

async function embedTextWithGemma(inputText) {
    const embeddingTensor = await gemmaFeatureExtrator(inputText, {
        pooling: 'mean',
        normalize: true,
    });
    return Array.from(embeddingTensor.data);
}

async function buildFaqEmbeddingsById() {
    const faqEmbeddingsById = {};
    for (const faqDocument of iilexFaqDocuments) {
        faqEmbeddingsById[faqDocument.id] = await embedTextWithGemma(faqDocument.text);
    }
    return faqEmbeddingsById;
}

console.log('Gerando embeddings para os documentos de FAQ...');
const faqEmbeddingsById = await buildFaqEmbeddingsById();
console.log(`${Object.keys(faqEmbeddingsById).length} documentos indexados, vetores de ${faqEmbeddingsById.doc_001.length} dimensões.`);

function cosineSimilarity(vectorA, vectorB) {
    let dotProduct = 0;
    for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i];
    }
    return dotProduct;
}

async function findMostRelevantFaqDocument(query) {
    const queryEmbedding = await embedTextWithGemma(query);
    let bestDocument = null;
    let bestScore = -1;
    for (const faqDocument of iilexFaqDocuments) {
        const score = cosineSimilarity(queryEmbedding, faqEmbeddingsById[faqDocument.id]);
        if (score > bestScore) {
            bestScore = score;
            bestDocument = faqDocument;
        }
    }
    return { document: bestDocument, score: bestScore };
}

async function answerAsDani(query, documentText) {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            stream: false,
            options: { temperature: 0 },
            messages: [
                { role: 'system', content: 'Você é Dani, nossa vendedora. Responda em português do Brasil, em no máximo 3 frases, simpática e direta. Use somente a informação do documento fornecido; se ela não for suficiente, diga que vai confirmar com o time e retornar.' },
                { role: 'user', content: `Essa é a pergunta do cliente: ${query}\n\nResponda baseado nesse documento:\n${documentText}` },
            ],
        }),
    });
    if (!ollamaResponse.ok) {
        throw new Error(`Ollama respondeu ${ollamaResponse.status}. O container esta de pe? (docker ps)`);
    }
    const ollamaData = await ollamaResponse.json();
    return ollamaData.message.content.trim();
}

async function answerCustomerQuestion(query) {
    const { document, score } = await findMostRelevantFaqDocument(query);
    const startedAt = Date.now();
    const answer = await answerAsDani(query, document.text);
    console.log(`  -> ${document.id} (score ${score.toFixed(4)}), gerado em ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return { id: document.id, score, answer };
}

async function readJsonRequestBody(request) {
    let rawBody = '';
    for await (const bodyChunk of request) {
        rawBody += bodyChunk;
    }
    return JSON.parse(rawBody || '{}');
}

function sendJsonResponse(response, statusCode, jsonData) {
    response.writeHead(statusCode, {'Content-Type': 'application/json; charset=utf-8'});
    response.end(JSON.stringify(jsonData));
}

async function handleFaqRequest(request, response) {
    if (request.method !== 'POST' || request.url !== '/query') {
        return sendJsonResponse(response, 404, {error: 'Use POST /query to submit a question.'});
    }
    const { query } = await readJsonRequestBody(request);
    if (!query) {
        return sendJsonResponse(response, 400, {error: 'Campo "query" obrigatorio.'});
    }
    console.log(`Pergunta recebida: ${query}`);
    try {
        sendJsonResponse(response, 200, await answerCustomerQuestion(query));
    } catch (answerError) {
        console.error(answerError.message);
        sendJsonResponse(response, 502, {error: answerError.message});
    }
}

async function callTelegram(method, payload) {
    const telegramResponse = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    const telegramData = await telegramResponse.json();
    if (!telegramData.ok) {
        throw new Error(`Telegram ${method}: ${telegramData.description}`);
    }
    return telegramData.result;
}

async function pollTelegramForever() {
    const bot = await callTelegram('getMe', {});
    console.log(`Bot do Telegram conectado: @${bot.username}`);
    let nextUpdateOffset = 0;
    while (true) {
        try {
            const updates = await callTelegram('getUpdates', { offset: nextUpdateOffset, timeout: 30 });
            for (const update of updates) {
                nextUpdateOffset = update.update_id + 1;
                const message = update.message;
                if (!message?.text) continue;
                console.log(`Telegram (${message.chat.id}): ${message.text}`);
                await callTelegram('sendChatAction', { chat_id: message.chat.id, action: 'typing' });
                try {
                    const { answer } = await answerCustomerQuestion(message.text);
                    await callTelegram('sendMessage', { chat_id: message.chat.id, text: answer });
                } catch (answerError) {
                    console.error(answerError.message);
                    await callTelegram('sendMessage', { chat_id: message.chat.id, text: 'Deu um problema aqui, tenta de novo em instantes.' });
                }
            }
        } catch (pollError) {
            console.error(`Falha no polling: ${pollError.message}`);
            await new Promise((resolve) => setTimeout(resolve, 3000));
        }
    }
}

const faqRagServer = http.createServer(handleFaqRequest);

faqRagServer.on('error', (serverError) => {
    if (serverError.code === 'EADDRINUSE') {
        console.error(`A porta ${FAQ_RAG_SERVER_PORT} ja esta em uso. Rode com outra: PORT=${FAQ_RAG_SERVER_PORT + 1} npm start`);
        process.exit(1);
    }
    throw serverError;
});

faqRagServer.listen(FAQ_RAG_SERVER_PORT, () => {
  console.log(`v2 ouvindo em http://localhost:${FAQ_RAG_SERVER_PORT}/query (modelo ${OLLAMA_MODEL})`);
});

if (TELEGRAM_BOT_TOKEN) {
    pollTelegramForever();
} else {
    console.log('Sem TELEGRAM_BOT_TOKEN: rodando so o HTTP. Para ligar o bot, exporte o token e reinicie.');
}
