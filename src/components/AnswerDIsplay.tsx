// src/components/AnswerDisplay.tsx
import React, { useState, useEffect } from 'react';
import { TechnicalQuestion } from '../TechnicalQuestionDetector';
import { OpenAIService } from '../services/OpenAIService';

interface AnswerDisplayProps {
  question: TechnicalQuestion | null;
  apiKey: string;
}

const AnswerDisplay: React.FC<AnswerDisplayProps> = ({ question, apiKey }) => {
  const [answer, setAnswer] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [responseTime, setResponseTime] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  
  // Create a new service instance when the API key changes
  useEffect(() => {
    if (!apiKey) return;
    
    // Clear previous answers when API key changes
    setAnswer('');
    setError('');
    setResponseTime(0);
  }, [apiKey]);
  
  const getAnswer = async () => {
    if (!question || !apiKey) {
      setError('API key is required to get answers');
      return;
    }
    
    setIsLoading(true);
    setIsStreaming(true);
    setError('');
    setAnswer('');
    
    const llmService = new OpenAIService({
      apiKey,
      stream: true,
      maxTokens: 400,
      temperature: 0.3,
      onStreamUpdate: (partialResponse) => {
        setAnswer(partialResponse);
      }
    });
    
    try {
      const response = await llmService.getAnswer(question.text);
      setAnswer(response.answer);
      setResponseTime(response.responseTime);
    } catch (err) {
      setError(`Error getting answer: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };
  
  if (!question) {
    return (
      <div className="no-question-selected">
        No question selected. Click on a detected question to select it.
      </div>
    );
  }
  
  return (
    <div className="answer-container">
      <div className="answer-header">
        <h2 className="answer-title">Answer</h2>
        <button 
          onClick={getAnswer}
          className="button primary-button"
          disabled={isLoading || !apiKey}
        >
          {isLoading ? 'Generating...' : 'Get Answer'}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="answer-content">
        {isLoading && !answer && (
          <div className="loading-indicator">
            <span className="loading-spinner"></span>
            <span>Generating answer...</span>
          </div>
        )}
        
        {answer && (
          <div>
            <div className={`answer-text ${isStreaming ? 'streaming' : ''}`}>
              {answer}
              {isStreaming && <span className="cursor">|</span>}
            </div>
            {responseTime > 0 && !isStreaming && (
              <div className="answer-meta">
                Answer generated in {(responseTime / 1000).toFixed(2)}s
              </div>
            )}
          </div>
        )}
        
        {!isLoading && !answer && (
          <div className="answer-placeholder">
            Click "Get Answer" to generate a response to this question.
          </div>
        )}
      </div>
      
      {!apiKey && (
        <div className="api-key-missing">
          Please enter your OpenAI API key in the settings panel to get answers.
        </div>
      )}
    </div>
  );
};

export default AnswerDisplay;