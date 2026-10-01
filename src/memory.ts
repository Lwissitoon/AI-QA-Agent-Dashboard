import { Chroma } from '@langchain/community/vectorstores/chroma';
import { OllamaEmbeddings } from '@langchain/ollama';
import { Document } from '@langchain/core/documents';

// Modelo para generar vectores de texto
const embeddings = new OllamaEmbeddings({
  model: 'nomic-embed-text',
  baseUrl: 'http://localhost:11434'
});

const VECTOR_COLLECTION = 'qa_agent_memory';
const CHROMA_URL = 'http://localhost:8000';

async function getVectorStore() {
  return await Chroma.fromExistingCollection(embeddings, {
    collectionName: VECTOR_COLLECTION,
    url: CHROMA_URL
  }).catch(async () => {
    return await Chroma.fromDocuments(
      [
        new Document({
          pageContent: 'Base memory initialized for QA agent.',
          metadata: { type: 'system' }
        })
      ],
      embeddings,
      { collectionName: VECTOR_COLLECTION, url: CHROMA_URL }
    );
  });
}

/**
 * Guarda en la base vectorial las lecciones aprendidas de un caso ejecutado.
 */
export async function saveTestMemory(
  testId: string,
  goal: string,
  passed: boolean,
  logs: Array<{ step: number; action: string; thought: string; status?: string }>,
  error?: string
) {
  try {
    const vectorStore = await getVectorStore();
    const documents: Document[] = [];

    if (!passed && error) {
      documents.push(
        new Document({
          pageContent: `Error en prueba sobre objetivo "${goal}". Fallo: ${error}. Pasos intentados: ${JSON.stringify(logs)}`,
          metadata: { testId, goal, result: 'FAILED', timestamp: Date.now() }
        })
      );
    } else {
      documents.push(
        new Document({
          pageContent: `Secuencia exitosa para el objetivo "${goal}". Pasos utilizados: ${logs.map(l => `${l.action} ->${l.thought}`).join(' | ')}`,
          metadata: { testId, goal, result: 'PASSED', timestamp: Date.now() }
        })
      );
    }

    await vectorStore.addDocuments(documents);
    console.log(`🧠 [RAG Memory] Guardada experiencia para ${testId} (${passed ? 'PASSED' : 'FAILED'})`);
  } catch (err) {
    console.error('Error guardando en ChromaDB:', err);
  }
}

/**
 * Recupera contextos de ejecuciones previas similares al objetivo actual.
 */
export async function retrieveRelevantContext(currentGoal: string, topK: number = 3): Promise<string> {
  try {
    const vectorStore = await getVectorStore();
    const results = await vectorStore.similaritySearch(currentGoal, topK);

    if (results.length === 0) return 'No hay registros previos similares.';

    return results
      .map(
        (doc: Document, index: number) =>
          `--- Lección previa ${index + 1} (${doc.metadata.result || 'INFO'}) ---\n${doc.pageContent}`
      )
      .join('\n\n');
  } catch (err) {
    console.warn('⚠️ No se pudo consultar la memoria RAG:', err);
    return 'Memoria no disponible.';
  }
}