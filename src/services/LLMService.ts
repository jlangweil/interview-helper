// src/services/LLMService.ts
export interface LLMResponse {
    answer: string;
    responseTime: number;
    source: string;
  }
  
  export interface LLMOptions {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
    onStreamUpdate?: (partialResponse: string) => void;
  }
  
  export abstract class LLMService {
    protected options: LLMOptions;
    
    constructor(options: LLMOptions) {
      this.options = {
        maxTokens: 300,
        temperature: 0.3,
        stream: true, // Default to streaming
        ...options
      };
    }
    
    abstract getAnswer(question: string): Promise<LLMResponse>;
    
    // Helper to measure response time
    protected measureTime<T>(promise: Promise<T>): Promise<{ result: T, time: number }> {
      const startTime = Date.now();
      return promise.then(result => ({
        result,
        time: Date.now() - startTime
      }));
    }
  }