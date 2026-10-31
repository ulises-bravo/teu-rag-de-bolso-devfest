#!/bin/sh
# Baixa o modelo de embedding para o cache do transformers.js.
#
# Rode ANTES do workshop. Usa curl com retomada (-C -) e retentativa,
# então uma conexao instavel nao obriga a recomecar os 380 MB do zero
# (que e exatamente o que o fetch interno do Node faz ao falhar).
#
# Depois disso, `npm start` sobe em ~4s sem tocar na rede.

set -e

REPO="Xenova/multilingual-e5-small"
CACHE="node_modules/@huggingface/transformers/.cache/$REPO"

mkdir -p "$CACHE/onnx"

for FILE in config.json tokenizer.json tokenizer_config.json onnx/model_q4.onnx; do
    echo "Baixando $FILE..."
    curl -L --fail --retry 10 --retry-all-errors --retry-delay 3 -C - -# \
        -o "$CACHE/$FILE" \
        "https://huggingface.co/$REPO/resolve/main/$FILE"
done

echo ""
echo "Modelo em cache ($(du -sh "$CACHE" | cut -f1)). O npm start agora leva ~4s."
