import React, { useState, useEffect, useRef } from 'react';
import './VoiceUI.css';
import TechnicalQuestionDetector, { TechnicalQuestion } from './TechnicalQuestionDetector';

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
  const [lastProcessedLength, setLastProcessedLength] = useState<number>(0);
  
  // Refs
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const questionDetectorRef = useRef<TechnicalQuestionDetector>(new TechnicalQuestionDetector());
  
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
      setTranscript(prev => {
        const newTranscript = prev ? `${prev} ${final}` : final;
        
        // Check for technical questions in final transcript
        detectTechnicalQuestions(newTranscript);
        
        return newTranscript;
      });
      setInterimTranscript('');
    } else {
      setInterimTranscript(interim);
    }
  };

// Detect technical questions in the transcript
const detectTechnicalQuestions = (text: string) => {
  // Only analyze the new part of the transcript
  const newText = text.length > lastProcessedLength 
    ? text.substring(lastProcessedLength) 
    : text;
  
  // Update the processed length
  setLastProcessedLength(text.length);
  
  // Check if the new text is a technical question
  const question = questionDetectorRef.current.createTechnicalQuestion(newText);
  
  if (question) {
    console.log('Detected technical question:', question);
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
    // Simple similarity check based on Levenshtein distance
    const maxLength = Math.max(q1.length, q2.length);
    if (maxLength === 0) return true;
    
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(q1.toLowerCase(), q2.toLowerCase());
    const similarity = 1 - distance / maxLength;
    
    // Consider questions similar if they're at least 80% similar
    return similarity > 0.8;
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