// Flywheel Data Retrieval Tool
// Query Elasticsearch for flywheel records

import { Client } from "@elastic/elasticsearch";

const esClient = new Client({
  node: process.env.ELASTICSEARCH_ENDPOINT ?? "http://localhost:9200",
});

export async function getFlywheelStats(): Promise<any> {
  try {
    const result = await esClient.count({
      index: "nvidia-cli-traces"
    });
    
    const recent = await esClient.search({
      index: "nvidia-cli-traces",
      body: {
        query: { match_all: {} },
        sort: [{ timestamp: { order: "desc" } }],
        size: 5
      }
    });

    return {
      total_records: result.count,
      recent_records: recent.hits.hits.map((hit: any) => ({
        id: hit._source.id,
        timestamp: hit._source.timestamp,
        user_message: hit._source._original?.userMessage?.substring(0, 100) + "...",
        model: hit._source._original?.model
      }))
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message, total_records: 0, recent_records: [] };
  }
}

export async function exportFlywheelData(): Promise<string[]> {
  try {
    const result = await esClient.search({
      index: "nvidia-cli-traces",
      body: {
        query: { match_all: {} },
        size: 1000
      }
    });

    return result.hits.hits.map((hit: any) => JSON.stringify(hit._source));
  } catch (error) {
    console.error("Failed to export flywheel data:", error);
    return [];
  }
}
