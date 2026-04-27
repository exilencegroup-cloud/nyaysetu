import React, { useState } from 'react';
import { Send, X, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  caseData: any;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const suggestedQuestions = [
  "Why did the court reject this argument?",
  "What was the strongest factor in the decision?",
  "How can I strengthen this case?",
  "What precedents were relied upon?",
];

export function ChatPanel({ isOpen, onClose, caseData }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: ChatMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: input,
          caseData,
        }),
      });

      const data = await response.json();
      const assistantMessage: ChatMessage = { role: 'assistant', content: data.answer };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: ChatMessage = { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInput(question);
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-primary/20 backdrop-blur-sm z-40 transition-opacity duration-200"
        onClick={onClose}
      />
      
      <div className="fixed right-0 top-0 h-full w-full sm:w-[35%] md:w-[40%] bg-card shadow-modal z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} className="text-accent" />
            <h3 className="text-lg sm:text-xl font-serif font-semibold text-primary">Ask AI About This Case</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-primary/5 rounded-button transition-colors duration-base"
            aria-label="Close"
          >
            <X size={20} className="text-muted hover:text-primary transition-colors" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-background">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted">Ask a question about this case:</p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleSuggestedQuestion(question)}
                    className="px-3 py-2 text-xs bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition-colors"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={cn(
                  'p-3 rounded-lg max-w-[85%]',
                  message.role === 'user'
                    ? 'bg-accent text-primary ml-auto'
                    : 'bg-muted text-secondary'
                )}
              >
                <p className="text-sm leading-relaxed">{message.content}</p>
              </div>
            ))}
            {isLoading && (
              <div className="p-3 rounded-lg bg-muted text-secondary max-w-[85%]">
                <p className="text-sm">Thinking...</p>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 sm:p-6 border-t border-border bg-card">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Ask a question about this case..."
              className="flex-1 px-4 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
