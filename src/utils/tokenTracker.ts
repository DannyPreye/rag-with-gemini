export class TokenTracker
{
    private static APPROXIMATE_TOKENS_PER_CHAR = 0.33; // rough estimation
    static EMBEDDING_COST_PER_1K_TOKENS = 0.0001; // adjust based on actual pricing
    static GENERATION_COST_PER_1K_TOKENS = 0.001; // adjust based on actual pricing

    static estimateTokenCount(text: string): number
    {
        return Math.ceil(text.length * this.APPROXIMATE_TOKENS_PER_CHAR);
    }

    static calculateVectorDBCost(vectors: number): number
    {
        // Pinecone costs are typically based on vector count and dimension size
        // Adjust the formula based on your pricing tier
        return vectors * 0.0001; // example cost per vector
    }
}
