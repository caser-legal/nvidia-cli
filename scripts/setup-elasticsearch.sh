#!/bin/bash
# Downloads and extracts Elasticsearch 8.11.0 if not present

ES_VERSION="8.11.0"
ES_DIR="elasticsearch-$ES_VERSION"

cd "$(dirname "$0")/.."

if [ -d "$ES_DIR" ]; then
    echo "✅ Elasticsearch $ES_VERSION already installed"
    exit 0
fi

echo "📦 Downloading Elasticsearch $ES_VERSION..."

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    ES_URL="https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-$ES_VERSION-darwin-aarch64.tar.gz"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    ES_URL="https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-$ES_VERSION-linux-x86_64.tar.gz"
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

curl -L -o elasticsearch.tar.gz "$ES_URL"
tar -xzf elasticsearch.tar.gz
rm elasticsearch.tar.gz

echo "✅ Elasticsearch $ES_VERSION installed"
