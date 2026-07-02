
import React, { useState, useEffect, useRef } from "react";
import { Conversation } from "@/entities/Conversation";
import { InvokeLLM } from "@/integrations/Core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Send, Bot, User as UserIcon, Globe, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";

export default function Assistant() {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const messagesEndRef = useRef(null);

  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "fr", name: "Français" },
    { code: "de", name: "Deutsch" },
    { code: "it", name: "Italiano" },
    { code: "pt", name: "Português" },
    { code: "ru", name: "Русский" },
    { code: "ja", name: "日本語" },
    { code: "ko", name: "한국어" },
    { code: "zh", name: "中文" },
    { code: "ar", name: "العربية" },
    { code: "hi", name: "हिन्दी" }
  ];

  const loadMessages = async () => {
    const conversationHistory = await Conversation.list("-timestamp", 50);
    setMessages(conversationHistory);
  };

  const addWelcomeMessage = async () => {
    const welcomeMessage = {
      message: "👋 Hi! I'm your AI Website Assistant. I'm here to help you understand how WebCraft AI works and guide you through creating amazing websites. Feel free to ask me anything about:\n\n• How to use the website generator\n• Best practices for website design\n• Choosing the right theme and colors\n• Content suggestions for different industries\n• Technical questions about web development\n\nWhat would you like to know?",
      role: "assistant",
      timestamp: new Date().toISOString(),
      language: selectedLanguage
    };

    await Conversation.create(welcomeMessage);
    setMessages([welcomeMessage]);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  useEffect(() => {
    const initializeChat = async () => {
      // Only add welcome message if there are no messages after loading
      // This ensures we don't add it if loadMessages() fetched existing ones
      if (messages.length === 0) {
        await addWelcomeMessage();
      }
    };
    // Use messages.length as a dependency to react to whether messages were loaded or not.
    // This effect runs after the initial loadMessages() has potentially updated the state.
    initializeChat();
  }, [messages.length]); // Dependency on messages.length to correctly trigger after loadMessages

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    const userMessage = {
      message: inputMessage,
      role: "user", 
      timestamp: new Date().toISOString(),
      language: selectedLanguage
    };

    await Conversation.create(userMessage);
    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const systemPrompt = `You are an AI assistant for WebCraft AI, a website generation platform. Help users understand:

1. How to use the AI website generator effectively
2. Best practices for website design and user experience
3. Choosing appropriate themes, colors, and content
4. Industry-specific website requirements
5. Technical aspects of web development in simple terms

Always be helpful, encouraging, and provide specific, actionable advice. 
Respond in ${languages.find(l => l.code === selectedLanguage)?.name || 'English'}.
Keep responses concise but informative.

Context: The user is using WebCraft AI which generates complete, responsive HTML websites with embedded CSS based on user descriptions. The platform supports multiple themes (modern, minimal, corporate, creative, elegant, bold) and color schemes.`;

      const conversationContext = messages.slice(-5).map(m => 
        `${m.role}: ${m.message}`
      ).join('\n');

      const response = await InvokeLLM({
        prompt: `${systemPrompt}\n\nConversation history:\n${conversationContext}\n\nUser: ${inputMessage}\n\nAssistant:`,
        add_context_from_internet: false
      });

      const assistantMessage = {
        message: response,
        role: "assistant",
        timestamp: new Date().toISOString(),
        language: selectedLanguage
      };

      await Conversation.create(assistantMessage);
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error getting AI response:", error);
      const errorMessage = {
        message: "I apologize, but I'm having trouble responding right now. Please try again in a moment.",
        role: "assistant",
        timestamp: new Date().toISOString(),
        language: selectedLanguage
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickQuestions = [
    "How do I create my first website?",
    "What's the best theme for a business website?",
    "How do I choose the right colors?",
    "Can you explain the different website categories?",
    "What makes a website responsive?",
    "How do I download my generated website?"
  ];

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-4 flex items-center gap-3">
            <MessageCircle className="w-10 h-10 text-indigo-400" />
            AI Assistant
          </h1>
          <p className="text-gray-300 mb-6">
            Get help and guidance on creating amazing websites with AI
          </p>
          
          <div className="flex items-center gap-4 mb-6">
            <Globe className="w-5 h-5 text-gray-400" />
            <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <SelectTrigger className="w-48 bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languages.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card className="bg-white/5 backdrop-blur-xl border-white/20 mb-6">
          <CardContent className="p-0">
            {/* Messages */}
            <div className="h-96 lg:h-[500px] overflow-y-auto p-6 space-y-4">
              <AnimatePresence>
                {messages.map((message, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        message.role === 'user' 
                          ? 'bg-gradient-to-r from-indigo-500 to-purple-500' 
                          : 'bg-white/10'
                      }`}>
                        {message.role === 'user' ? (
                          <UserIcon className="w-4 h-4 text-white" />
                        ) : (
                          <Bot className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <div className={`rounded-xl p-4 ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30'
                          : 'bg-white/10 border border-white/20'
                      }`}>
                        <p className="text-white whitespace-pre-wrap">{message.message}</p>
                        <p className="text-xs text-gray-400 mt-2">
                          {format(new Date(message.timestamp), "HH:mm")}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="bg-white/10 border border-white/20 rounded-xl p-4">
                    <div className="flex items-center gap-2 text-white">
                      <Sparkles className="w-4 h-4 animate-spin" />
                      Thinking...
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-white/20 p-4">
              <div className="flex gap-3">
                <Input
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask me anything about creating websites..."
                  className="flex-1 bg-white/10 border-white/20 text-white placeholder-gray-400"
                  disabled={isLoading}
                />
                <Button
                  onClick={sendMessage}
                  disabled={isLoading || !inputMessage.trim()}
                  className="bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Questions */}
        <Card className="bg-white/5 backdrop-blur-xl border-white/20">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Quick Questions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {quickQuestions.map((question, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  onClick={() => setInputMessage(question)}
                  className="text-left justify-start h-auto p-3 text-gray-300 hover:text-white hover:bg-white/10 border border-white/10"
                >
                  {question}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
