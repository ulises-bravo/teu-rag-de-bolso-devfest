import http from 'node:http';
import {pipeline} from '@huggingface/transformers';

const FAQ_RAG_SERVER_PORT = Number(process.env.PORT ?? 3000);

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
                console.error('Nao foi possivel baixar o modelo. Verifique a conexao e rode de novo.');
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
        const embedding = await embedTextWithGemma(faqDocument.text);
        faqEmbeddingsById[faqDocument.id] = embedding;
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

async function readJsonRequestBody(request) {
    let rawBody = '';
    for await (const bodyChunk of request) {
        rawBody += bodyChunk;
    }
    return JSON.parse(rawBody || '{}');
}

function sendJsonResponse(response, statusCode, jsonData) {
    response.writeHead(statusCode, {'Content-Type': 'application/json'});
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
    const { document, score } = await findMostRelevantFaqDocument(query);
    sendJsonResponse(response, 200, {id: document.id, score, documents: document.text});
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
  console.log(`v1 ouvindo em http://localhost:${FAQ_RAG_SERVER_PORT}/query`);
});
