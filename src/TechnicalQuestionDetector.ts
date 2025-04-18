/**
 * Technical Question Detector
 * 
 * This module analyzes text to determine if it contains a technical question.
 * It uses a combination of pattern matching, keyword detection, and heuristics.
 */

export interface DetectionResult {
    isTechnical: boolean;
    confidence: number;
    category?: string;
    detectedKeywords: string[];
  }
  
  export interface TechnicalQuestion {
    id: string;
    text: string;
    timestamp: string;
    category?: string;
    confidence: number;
  }
  
  // Technical domains to categorize questions
  export enum TechnicalDomain {
    Programming = "programming",
    DevOps = "devops",
    Database = "database",
    Networking = "networking",
    Security = "security",
    WebDevelopment = "web-development",
    MobileDevelopment = "mobile-development",
    DataScience = "data-science",
    ArtificialIntelligence = "artificial-intelligence",
    General = "general-technical"
  }
  
  class TechnicalQuestionDetector {
    // Keywords that suggest a technical question
    private technicalKeywords: Record<TechnicalDomain, string[]> = {
      [TechnicalDomain.Programming]: [
        'function', 'method', 'class', 'object', 'variable', 'loop', 'array', 
        'algorithm', 'runtime', 'compile', 'debug', 'error', 'exception',
        'syntax', 'javascript', 'python', 'java', 'c#', 'typescript', 'ruby',
        'rust', 'go', 'php', 'swift', 'kotlin', 'code', 'compiler', 'interpreter',
        'recursion', 'iteration', 'inheritance', 'polymorphism', 'encapsulation',
        'data structure', 'framework', 'library', 'api', 'sdk', 'lint', 'import'
      ],
      [TechnicalDomain.DevOps]: [
        'ci/cd', 'pipeline', 'jenkins', 'docker', 'kubernetes', 'container', 
        'orchestration', 'deployment', 'automation', 'infrastructure', 'terraform',
        'ansible', 'chef', 'puppet', 'aws', 'azure', 'gcp', 'cloud', 'microservice',
        'serverless', 'lambda', 'function-as-a-service', 'iaas', 'paas', 'saas', 
        'devops', 'sre', 'gitlab', 'github actions', 'circle ci'
      ],
      [TechnicalDomain.Database]: [
        'database', 'sql', 'nosql', 'query', 'index', 'relational', 'mongo',
        'postgresql', 'mysql', 'oracle', 'sqlite', 'join', 'transaction', 'acid',
        'normalization', 'denormalization', 'schema', 'table', 'column', 'row',
        'primary key', 'foreign key', 'couchbase', 'cassandra', 'redis', 'memcached'
      ],
      [TechnicalDomain.Networking]: [
        'network', 'tcp/ip', 'http', 'https', 'dns', 'ip address', 'subnet', 
        'gateway', 'routing', 'firewall', 'vpn', 'proxy', 'load balancer', 'cdn',
        'latency', 'bandwidth', 'packet', 'protocol', 'socket', 'port', 'nat'
      ],
      [TechnicalDomain.Security]: [
        'security', 'encryption', 'authentication', 'authorization', 'oauth',
        'jwt', 'certificate', 'vulnerability', 'exploit', 'penetration test',
        'firewall', 'csrf', 'xss', 'sql injection', 'hash', 'salt', 'cipher'
      ],
      [TechnicalDomain.WebDevelopment]: [
        'html', 'css', 'javascript', 'dom', 'react', 'angular', 'vue', 'svelte',
        'webpack', 'babel', 'responsive', 'spa', 'pwa', 'web component', 'sass',
        'less', 'bootstrap', 'tailwind', 'ajax', 'fetch', 'restful', 'graphql',
        'browser', 'render', 'accessibility', 'a11y', 'cors', 'frontend', 'backend'
      ],
      [TechnicalDomain.MobileDevelopment]: [
        'android', 'ios', 'swift', 'kotlin', 'react native', 'flutter', 'mobile',
        'app store', 'play store', 'notification', 'responsive', 'touch', 'gesture',
        'xcode', 'android studio', 'emulator', 'simulator'
      ],
      [TechnicalDomain.DataScience]: [
        'data science', 'machine learning', 'statistics', 'regression', 'classification',
        'clustering', 'neural network', 'pandas', 'numpy', 'scipy', 'matplotlib',
        'jupyter', 'kaggle', 'feature', 'dataset', 'model', 'train', 'test', 'validate',
        'accuracy', 'precision', 'recall', 'f1 score', 'r squared', 'visualization'
      ],
      [TechnicalDomain.ArtificialIntelligence]: [
        'ai', 'artificial intelligence', 'machine learning', 'deep learning', 'neural network',
        'nlp', 'natural language processing', 'computer vision', 'reinforcement learning',
        'supervised', 'unsupervised', 'tensorflow', 'pytorch', 'keras', 'transformers',
        'gpt', 'bert', 'llm', 'large language model', 'embedding', 'tokens', 'fine-tuning',
        'prompt engineering', 'rlhf', 'diffusion model'
      ],
      [TechnicalDomain.General]: [
        'technical', 'technology', 'system', 'architecture', 'design pattern',
        'best practice', 'implementation', 'integration', 'configuration', 'setup',
        'install', 'uninstall', 'update', 'upgrade', 'downgrade', 'compatibility',
        'performance', 'optimization', 'bottleneck', 'scalability', 'maintenance'
      ]
    };
  
    // Question patterns that commonly indicate a technical question
    private questionPatterns: RegExp[] = [
      /how (?:do|can|would|should) I/i,
      /how (?:to|do you)/i,
      /what (?:is|are|does)/i,
      /why (?:does|is|are|do)/i,
      /can you explain/i,
      /could you (?:help|tell|explain|describe)/i,
      /difference between/i,
      /when (?:should|would|do)/i,
      /where (?:can|should|do)/i,
      /\?$/
    ];
  
    /**
     * Analyze text to detect if it contains a technical question
     * @param text The text to analyze
     * @returns Detection result with confidence and category
     */
    public detectTechnicalQuestion(text: string): DetectionResult {
      const cleanText = text.trim().toLowerCase();
      
      // Check if text has question-like patterns
      const isQuestionLike = this.hasQuestionPattern(cleanText);
      
      // Find all technical keywords in the text
      const keywordMatches = this.findTechnicalKeywords(cleanText);
      
      // Determine the most likely technical domain
      const { category, keywordCount } = this.determineTechnicalDomain(keywordMatches);
      
      // Calculate confidence based on question patterns and keyword matches
      const confidence = this.calculateConfidence(isQuestionLike, keywordCount, cleanText.length);
      
      // Determine if this is a technical question based on confidence threshold
      const isTechnical = confidence > 0.6;
      
      return {
        isTechnical,
        confidence,
        category: isTechnical ? category : undefined,
        detectedKeywords: keywordMatches
      };
    }
  
    /**
     * Check if text contains question-like patterns
     */
    private hasQuestionPattern(text: string): boolean {
      return this.questionPatterns.some(pattern => pattern.test(text));
    }
  
    /**
     * Find all technical keywords in the text
     */
    private findTechnicalKeywords(text: string): string[] {
      const matches: string[] = [];
      
      // Check all domains for keyword matches
      Object.values(this.technicalKeywords).forEach(keywords => {
        keywords.forEach(keyword => {
          // Check for exact keyword match with word boundaries
          const regex = new RegExp(`\\b${keyword}\\b`, 'i');
          if (regex.test(text) && !matches.includes(keyword)) {
            matches.push(keyword);
          }
        });
      });
      
      return matches;
    }
  
    /**
     * Determine the most likely technical domain based on keyword matches
     */
    private determineTechnicalDomain(keywords: string[]): { category: string, keywordCount: number } {
      if (keywords.length === 0) {
        return { category: TechnicalDomain.General, keywordCount: 0 };
      }
      
      const domainCounts: Record<string, number> = {};
      
      // Count matches for each domain
      Object.entries(this.technicalKeywords).forEach(([domain, domainKeywords]) => {
        domainCounts[domain] = 0;
        
        keywords.forEach(keyword => {
          if (domainKeywords.includes(keyword.toLowerCase())) {
            domainCounts[domain]++;
          }
        });
      });
      
      // Find domain with most matches
      let maxCount = 0;
      let topDomain = TechnicalDomain.General;
      
      Object.entries(domainCounts).forEach(([domain, count]) => {
        if (count > maxCount) {
          maxCount = count;
          topDomain = domain as TechnicalDomain;
        }
      });
      
      return { category: topDomain, keywordCount: keywords.length };
    }
  
    /**
     * Calculate confidence score for technical question detection
     */
    private calculateConfidence(isQuestionLike: boolean, keywordCount: number, textLength: number): number {
      // Base confidence from question pattern detection
      let confidence = isQuestionLike ? 0.5 : 0.2;
      
      // Add confidence based on keyword density
      if (textLength > 0) {
        // Adjust keyword weight based on text length to avoid bias for short texts
        const keywordWeight = Math.min(keywordCount * 0.15, 0.45);
        confidence += keywordWeight;
      }
      
      // Cap confidence at 0.95
      return Math.min(confidence, 0.95);
    }
  
    /**
     * Create a technical question object from detected text
     */
    public createTechnicalQuestion(text: string): TechnicalQuestion | null {
      const detectionResult = this.detectTechnicalQuestion(text);
      
      if (!detectionResult.isTechnical) {
        return null;
      }
      
      return {
        id: Date.now().toString(),
        text: text.trim(),
        timestamp: new Date().toLocaleTimeString(),
        category: detectionResult.category,
        confidence: detectionResult.confidence
      };
    }
  }
  
  export default TechnicalQuestionDetector;