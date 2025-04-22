import React, { useState, useEffect, useRef } from 'react';
import './VoiceUI.css';
import TechnicalQuestionDetector, { TechnicalQuestion } from './TechnicalQuestionDetector';
import AnswerDisplay from './components/AnswerDIsplay'

// Define types for our component
interface RecognitionError extends Event {
  error: string;
  message?: string;
}

interface RecognitionResult {
  isFinal: boolean;
  [index: number]: {
    transcript: string;
    confidence: number;
  };
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: RecognitionResult;
    length: number;
  };
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: RecognitionError) => void) | null;
  onend: ((event: Event) => void) | null;
}

interface Window {
  SpeechRecognition?: new () => SpeechRecognition;
  webkitSpeechRecognition?: new () => SpeechRecognition;
}

// For tracking processed segments to avoid duplicates
interface ProcessedSegment {
  text: string;
  timestamp: number;
}

const VoiceUI: React.FC = () => {
  // State for voice recognition
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [source, setSource] = useState<'microphone' | 'system'>('microphone');
  const [error, setError] = useState<string>('');
  
  // State for technical questions
  const [detectedQuestions, setDetectedQuestions] = useState<TechnicalQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(-1);
  
  // Keep track of processed speech segments to avoid analyzing the same text twice
  const [processedSegments, setProcessedSegments] = useState<ProcessedSegment[]>([]);
  
  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const questionDetectorRef = useRef<TechnicalQuestionDetector>(new TechnicalQuestionDetector());

  const [apiKey, setApiKey] = useState<string>('');
  
  // Initialize speech recognition
  useEffect(() => {
    const windowWithSpeech = window as unknown as Window;
    
    if (!windowWithSpeech.SpeechRecognition && !windowWithSpeech.webkitSpeechRecognition) {
      setError('Speech recognition not supported in this browser');
      return;
    }
    
    const SpeechRecognition = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = handleRecognitionResult as unknown as ((event: Event) => void);
      
      recognitionRef.current.onerror = (event: RecognitionError) => {
        console.error('Recognition error:', event.error);
        
        let errorMessage = '';
        switch (event.error) {
          case 'not-allowed':
            errorMessage = 'Microphone access denied. Please check your browser permissions and privacy settings.';
            break;
          case 'no-speech':
            errorMessage = 'No speech detected. Please try speaking again.';
            break;
          case 'audio-capture':
            errorMessage = 'No microphone was found or microphone is busy.';
            break;
          case 'network':
            errorMessage = 'Network error occurred. Please check your connection.';
            break;
          default:
            errorMessage = `Recognition error: ${event.error}`;
        }
        
        setError(errorMessage);
        setIsListening(false);
      };

      // In the useEffect hook where we set up speech recognition
      recognitionRef.current.onend = (event) => {
        console.log('Recognition ended event fired');
        // Only auto-restart if we're still supposed to be listening
        if (isListening) {
          try {
            console.log('Auto-restarting recognition');
            recognitionRef.current?.start();
          } catch (err) {
            console.error('Failed to restart recognition:', err);
            setIsListening(false);
          }
        }
      };
    }
    
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        if (isListening) {
          stopListening();
        }
      }
    };
  }, []);

  // Process speech recognition results
  const handleRecognitionResult = (event: SpeechRecognitionEvent) => {
    let interim = '';
    let final = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }
    
    if (final) {
      // This is a new final segment that needs to be processed
      processNewSpeechSegment(final);
      
      setTranscript(prev => {
        return prev ? `${prev} ${final}` : final;
      });
      setInterimTranscript('');
    } else {
      setInterimTranscript(interim);
    }
  };

  // Process a new speech segment
  const processNewSpeechSegment = (segment: string) => {
    console.log('Processing new speech segment:', segment);
    
    // Check if we've processed this segment before
    if (isSegmentProcessed(segment)) {
      console.log('Segment already processed, skipping');
      return;
    }
    
    // Add this segment to processed segments
    setProcessedSegments(prev => [...prev, { 
      text: segment, 
      timestamp: Date.now() 
    }]);
    
    // Extract potential questions from the segment
    const questions = extractQuestions(segment);
    
    console.log('Extracted questions:', questions);
    
    // If no questions were extracted but the segment might be a conversational query
    if (questions.length === 0 && segment.length > 5) {
      // Check if this might be a conversational query without question structure
      if (mightBeConversationalQuery(segment)) {
        analyzeQuestion(segment);
      }
    } else {
      // Check each potential question
      questions.forEach(questionText => {
        // Only process questions with some minimum length
        if (questionText.length > 5) {
          analyzeQuestion(questionText);
        }
      });
    }
  };

  // Check if text might be a conversational query without question structure
  const mightBeConversationalQuery = (text: string): boolean => {
    const conversationalPatterns = [
      'tell me', 'explain', 'describe', 'show me', 'help me',
      'i need', 'i want', 'give me', 'can you', 'please',
      'how do', 'what is', 'what are', 'why is', 'why are'
    ];
    
    const lowerText = text.toLowerCase().trim();
    return conversationalPatterns.some(pattern => lowerText.includes(pattern));
  };

  const extractQuestions = (text: string): string[] => {
    const result: string[] = [];
    
    // Split into sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    
    // Process each sentence
    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      
      // Skip very short sentences
      if (trimmed.length < 3) continue;
      
      // If it has a question mark, it's a question
      if (text.includes(trimmed + '?')) {
        result.push(trimmed + '?');
        continue;
      }
      
      // Check for question starters and conversational patterns
      const questionIndicators = [
        'how', 'what', 'why', 'when', 'where', 'which', 'who', 'whose', 'whom',
        'can', 'could', 'would', 'should', 'is', 'are', 'am', 'was', 'were',
        'do', 'does', 'did', 'has', 'have', 'had', 'will', 'shall',
        'tell me', 'explain', 'describe', 'show me', 'help me understand'
      ];
      
      const lowerSentence = trimmed.toLowerCase();
      
      // Check if it starts with a question indicator
      for (const indicator of questionIndicators) {
        if (lowerSentence.startsWith(indicator) || 
            lowerSentence.includes(' ' + indicator + ' ')) {
          result.push(trimmed);
          break;
        }
      }
    }
    
    // If no sentences were identified as questions, but the text is reasonable length,
    // treat the entire text as a potential question
    if (result.length === 0 && text.trim().length > 0 && text.trim().length < 150) {
      result.push(text.trim());
    }
    
    return result;
  };

  // Check if a segment has already been processed to avoid duplicates
  const isSegmentProcessed = (segment: string): boolean => {
    return processedSegments.some(item => {
      const similarity = calculateSimilarity(item.text, segment);
      return similarity > 0.8; // 80% similarity threshold
    });
  };

  // Calculate text similarity (0-1)
  const calculateSimilarity = (a: string, b: string): number => {
    const maxLength = Math.max(a.length, b.length);
    if (maxLength === 0) return 1;
    
    const distance = levenshteinDistance(a.toLowerCase(), b.toLowerCase());
    return 1 - distance / maxLength;
  };

  // Analyze a potential question
  const analyzeQuestion = (questionText: string) => {
    // Check if this is a technical question using the detector
    const question = questionDetectorRef.current.createTechnicalQuestion(questionText);
    
    if (question) {
      console.log('Detected technical question:', question);
      
      // Add to detected questions list
      setDetectedQuestions(prev => {
        // Avoid duplicates by checking if similar question already exists
        const isDuplicate = prev.some(q => areSimilarQuestions(q.text, question.text));
        
        if (isDuplicate) {
          return prev;
        }
        
        const newQuestions = [...prev, question];
        setCurrentQuestionIndex(newQuestions.length - 1);
        return newQuestions;
      });
    }
  };

  // Check if two questions are similar to avoid duplicates
  const areSimilarQuestions = (q1: string, q2: string): boolean => {
    return calculateSimilarity(q1, q2) > 0.8; // 80% similarity threshold
  };

  // Simple Levenshtein distance implementation for text similarity
  const levenshteinDistance = (a: string, b: string): number => {
    const matrix: number[][] = [];
    
    // Initialize matrix
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    // Fill matrix
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = a[j - 1] === b[i - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,      // deletion
          matrix[i][j - 1] + 1,      // insertion
          matrix[i - 1][j - 1] + cost // substitution
        );
      }
    }
    
    return matrix[b.length][a.length];
  };

  // Start listening for audio
  const startListening = (): void => {
    console.log('Starting listening process...');
    
    // Update the UI state FIRST
    setIsListening(true);
    setError('');
    
    try {
      if (source === 'microphone') {
        if (recognitionRef.current) {
          recognitionRef.current.start();
          console.log('Microphone recognition started');
        } else {
          throw new Error('Speech recognition not initialized');
        }
      } else {
        startSystemAudioCapture();
      }
    } catch (err) {
      console.error('Failed to start listening:', err);
      setError(`Failed to start listening: ${err instanceof Error ? err.message : String(err)}`);
      // Reset the UI state if there was an error
      setIsListening(false);
    }
  };

  // Handle system audio capture separately
  const startSystemAudioCapture = (): void => {
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true
      }).then(stream => {
        mediaStreamRef.current = stream;
        
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length === 0) {
          throw new Error('No audio track available from system capture');
        }
        
        if (recognitionRef.current) {
          recognitionRef.current.start();
          console.log('System audio recognition started');
        }
      }).catch(err => {
        console.error('System audio capture failed:', err);
        setError(`System audio capture failed: ${err instanceof Error ? err.message : String(err)}`);
        setIsListening(false);
      });
    } catch (err) {
      console.error('Error in startSystemAudioCapture:', err);
      setError(`System audio capture failed: ${err instanceof Error ? err.message : String(err)}`);
      setIsListening(false);
    }
  };

  // Stop listening
  const stopListening = (): void => {
    console.log('Stopping listening...');
    
    // Update the UI state FIRST
    setIsListening(false);
    
    try {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        console.log('Recognition stopped');
      }
      
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        console.log('Media stream stopped');
      }
    } catch (err) {
      console.error('Error stopping recognition:', err);
      // The UI is already updated, so no need to set isListening again
    }
  };

  // Clear all data
  const clearTranscript = (): void => {
    setTranscript('');
    setInterimTranscript('');
    setError('');
    setProcessedSegments([]);
  };

  // Clear all questions
  const clearQuestions = (): void => {
    setDetectedQuestions([]);
    setCurrentQuestionIndex(-1);
  };

  // Clear all
  const clearAll = (): void => {
    clearTranscript();
    clearQuestions();
  };

  // Select a question
  const selectQuestion = (index: number): void => {
    setCurrentQuestionIndex(index);
  };

  return (
    <div className="container">
      <div className="app-header">
        <h1 className="app-title">Technical Voice Assistant</h1>
        <p className="app-subtitle">Capture and detect technical questions from voice input</p>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="main-content">
        <div className="left-panel">
          <div className="settings-panel">
            <h2 className="settings-title">Audio Settings</h2>
            
            <div className="source-selector">
              <label className="source-label">Audio Source:</label>
              <div className="source-options">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="audioSource"
                    value="microphone"
                    checked={source === 'microphone'}
                    onChange={() => setSource('microphone')}
                    disabled={isListening}
                  />
                  <span>Microphone</span>
                </label>
                
                <label className="radio-label">
                  <input
                    type="radio"
                    name="audioSource"
                    value="system"
                    checked={source === 'system'}
                    onChange={() => setSource('system')}
                    disabled={isListening}
                  />
                  <span>System Audio (Zoom/Teams)</span>
                </label>
              </div>
            </div>

            <div className="api-key-input">
            <label className="source-label">OpenAI API Key:</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-..."
              className="api-key-field"
              disabled={isListening}
            />
          </div>
            
            <div className="button-group">
              <button
                onClick={isListening ? stopListening : startListening}
                className={`button primary-button ${isListening ? 'stop' : ''}`}
              >
                {isListening ? 'Stop Listening' : 'Start Listening'}
              </button>
              
              <button
                onClick={clearAll}
                className="button secondary-button"
                disabled={isListening || (!transcript && detectedQuestions.length === 0)}
              >
                Clear All
              </button>
            </div>
          </div>          
          
          <div className="transcript-panel">
            <h2 className="transcript-title">Transcription:</h2>
            <div className="transcript-content">
              {transcript}
              {interimTranscript && (
                <span className="interim-text">{transcript ? ' ' : ''}{interimTranscript}</span>
              )}
              {!transcript && !interimTranscript && (
                <span className="transcript-placeholder">
                  {isListening ? 'Listening... Say something!' : 'Press "Start Listening" to begin'}
                </span>
              )}
            </div>
            <button 
              onClick={clearTranscript}
              className="button text-button"
              disabled={!transcript || isListening}
            >
              Clear Transcript
            </button>
          </div>
        </div>
        
        <div className="right-panel">
          <div className="questions-panel">
            <h2 className="questions-title">Detected Technical Questions:</h2>
            {detectedQuestions.length > 0 ? (
              <div className="questions-list">
                {detectedQuestions.map((question, index) => (
                  <div 
                    key={question.id}
                    className={`question-item ${currentQuestionIndex === index ? 'selected' : ''}`}
                    onClick={() => selectQuestion(index)}
                  >
                    <div className="question-header">
                      <span className="question-time">{question.timestamp}</span>
                      <span className="question-category">{question.category}</span>
                    </div>
                    <div className="question-text">{question.text}</div>
                    <div className="question-meta">
                      <span className="question-confidence">
                        Confidence: {Math.round(question.confidence * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-questions">
                No technical questions detected yet. Try asking a technical question when the system is listening.
              </div>
            )}
            {detectedQuestions.length > 0 && (
              <button 
                onClick={clearQuestions}
                className="button text-button"
                disabled={isListening}
              >
                Clear Questions
              </button>
            )}
          </div>
          
          <div className="selected-question-panel">
            <h2 className="selected-question-title">Selected Question</h2>
            {currentQuestionIndex >= 0 && currentQuestionIndex < detectedQuestions.length ? (
              <div className="selected-question">
                <div className="selected-question-content">
                  <div className="selected-question-text">
                    {detectedQuestions[currentQuestionIndex].text}
                  </div>
                  <div className="selected-question-meta">
                    <div>Category: {detectedQuestions[currentQuestionIndex].category}</div>
                    <div>Time: {detectedQuestions[currentQuestionIndex].timestamp}</div>
                    <div>Confidence: {Math.round(detectedQuestions[currentQuestionIndex].confidence * 100)}%</div>
                  </div>
                </div>
                <AnswerDisplay 
                  question={detectedQuestions[currentQuestionIndex]} 
                  apiKey={apiKey} 
                />
                <div className="answer-placeholder">
                  <p>
                    Answer will appear here once we connect to an LLM service.
                  </p>
                </div>
              </div>
            ) : (
              <div className="no-question-selected">
                No question selected. Click on a detected question to select it.
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="status-bar">
        <p>Status: {isListening ? 'Listening' : 'Not listening'}</p>
        <p>Source: {source}</p>
        <p>Questions: {detectedQuestions.length}</p>
      </div>
    </div>
  );
};

export default VoiceUI;