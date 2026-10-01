const { Chroma } = require("@langchain/community/vectorstores/chroma");
const { OllamaEmbeddings } = require("@langchain/community/embeddings/ollama");
const { Ollama } = require("@langchain/community/llms/ollama");

// Configuración de Embeddings locales
const embeddings = new OllamaEmbeddings({
    model: "nomic-embed-text", // Modelo ligero ideal para embeddings
    baseUrl: "http://localhost:11434",
});

// Instancia de LLM para deducción
const llm = new Ollama({
    model: "qwen2.5:7b-instruct", // O el modelo que estés usando
    baseUrl: "http://localhost:11434",
});

async function getVectorStore() {
    return await Chroma.fromExistingCollection(embeddings, {
        collectionName: "playwright_elements",
        url: "http://localhost:8000", // URL de tu instancia local de ChromaDB
    });
}

/**
 * Intenta recuperar un selector roto analizando el DOM actual y el contexto histórico.
 */
async function healSelector(brokenSelector, targetDescription, currentDOMSnapshot) {
    console.log(`[Self-Healing] Iniciando recuperación para: ${brokenSelector}`);
    
    try {
        const vectorStore = await getVectorStore();
        
        // 1. Buscar en ChromaDB elementos similares basados en la descripción
        const similarElements = await vectorStore.similaritySearch(targetDescription, 3);
        const historicalContext = similarElements.map(doc => doc.pageContent).join('\n');

        // 2. Pedir a Ollama que deduzca el nuevo selector
        const prompt = `
        Eres un experto en QA Automation. 
        El selector "${brokenSelector}" falló. 
        El objetivo original del elemento era: "${targetDescription}".
        
        Contexto histórico de elementos similares:
        ${historicalContext}
        
        Aquí tienes una versión simplificada del DOM actual:
        ${currentDOMSnapshot}
        
        Devuelve ÚNICAMENTE el nuevo selector CSS o XPath válido para Playwright. Sin explicaciones.
        `;

        const newSelector = await llm.invoke(prompt);
        console.log(`[Self-Healing] Nuevo selector sugerido: ${newSelector.trim()}`);
        
        return newSelector.trim();
        
    } catch (error) {
        console.error("[Self-Healing] Falló la recuperación:", error.message);
        return null;
    }
}

/**
 * Función para guardar selectores exitosos y entrenar la base de datos
 */
async function saveSuccessfulSelector(selector, description, htmlSnippet) {
    const vectorStore = await getVectorStore();
    await vectorStore.addDocuments([{
        pageContent: `Description: ${description}\nSelector: ${selector}\nHTML: ${htmlSnippet}`,
        metadata: { type: "ui_element", selector: selector }
    }]);
}

module.exports = { healSelector, saveSuccessfulSelector };