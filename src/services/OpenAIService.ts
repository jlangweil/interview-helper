// src/services/OpenAIService.ts
import { LLMService, LLMResponse, LLMOptions } from './LLMService';

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIChatChoice {
  message: {
    role: string;
    content: string;
  };
  index: number;
  finish_reason: string;
}

interface OpenAIChatChoiceDelta {
  delta: {
    content?: string;
  };
  index: number;
  finish_reason: string | null;
}

interface OpenAIChatResponse {
  id: string;
  choices: OpenAIChatChoice[];
  created: number;
}

interface OpenAIChatStreamResponse {
  id: string;
  choices: OpenAIChatChoiceDelta[];
  created: number;
}

export class OpenAIService extends LLMService {
  private apiUrl = 'https://api.openai.com/v1/chat/completions';
  
  constructor(options: LLMOptions) {
    super({
      model: 'gpt-4o-mini', // Using the o4-mini model
      stream: true, // Always use streaming for speed
      ...options
    });
    
    if (!options.apiKey) {
      throw new Error('OpenAI API key is required');
    }
  }
  
  async getAnswer(question: string): Promise<LLMResponse> {
    const systemPrompt = `Explain like I'm in a job interview—simple and practical. Answer like you're a programmer talking to another programmer—fast and clear. Keep it short and beginner-friendly, with an example. Give me the 'what it is' and 'why it matters' in one or two sentences`;
    
    const messages: OpenAIChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: question }
    ];
    
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.options.apiKey}`
      },
      body: JSON.stringify({
        model: this.options.model,
        messages: messages,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        stream: this.options.stream
      })
    };
    
    try {
      if (this.options.stream && this.options.onStreamUpdate) {
        return await this.streamResponse(requestOptions, question);
      } else {
        return await this.standardResponse(requestOptions, question);
      }
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw new Error(`Failed to get answer: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  private async standardResponse(requestOptions: RequestInit, question: string): Promise<LLMResponse> {
    const { result, time } = await this.measureTime(
      fetch(this.apiUrl, requestOptions)
        .then(response => {
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error(`API error: ${response.status} - ${text}`);
            });
          }
          return response.json();
        })
    );
    
    const response = result as OpenAIChatResponse;
    const answer = response.choices[0]?.message?.content || 'No answer received';
    
    return {
      answer,
      responseTime: time,
      source: 'openai'
    };
  }
  
  private async streamResponse(requestOptions: RequestInit, question: string): Promise<LLMResponse> {
    const startTime = Date.now();
    let fullAnswer = '';
    
    try {
      const response = await fetch(this.apiUrl, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '' && line.trim() !== 'data: [DONE]');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonStr = line.substring(6);
              if (jsonStr === '[DONE]') continue;
              
              const data = JSON.parse(jsonStr) as OpenAIChatStreamResponse;
              const content = data.choices[0]?.delta?.content || '';
              if (content) {
                fullAnswer += content;
                this.options.onStreamUpdate?.(fullAnswer);
              }
            } catch (e) {
              // Skip invalid JSON
              console.log('Failed to parse stream data:', e);
            }
          }
        }
      }
      
      const totalTime = Date.now() - startTime;
      
      return {
        answer: fullAnswer,
        responseTime: totalTime,
        source: 'openai-stream'
      };
    } catch (error) {
      console.error('Stream error:', error);
      throw error;
    }
  }
}