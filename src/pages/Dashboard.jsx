import React, { useState, useEffect } from "react";
import { Website } from "@/entities/Website";
import { User } from "@/entities/User";
import { InvokeLLM } from "@/integrations/Core";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Eye } from "lucide-react";
import { motion } from "framer-motion";

import GeneratorForm from "../components/generator/GeneratorForm";
import PreviewPanel from "../components/generator/PreviewPanel";
import QuickTemplates from "../components/generator/QuickTemplates";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "", 
    category: "",
    language: "en",
    theme: "modern",
    color_scheme: "blue"
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedWebsite, setGeneratedWebsite] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);

  useEffect(() => {
    loadUser();
    loadRecentProjects();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await User.me();
      setUser(currentUser);
    } catch (error) {
      console.error("User not logged in");
    }
  };

  const loadRecentProjects = async () => {
    const projects = await Website.list("-created_date", 3);
    setRecentProjects(projects);
  };

  const generateWebsite = async () => {
    if (!formData.title || !formData.description || !formData.category) {
      alert("Please fill in all required fields");
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = `Create a complete, modern, responsive website with the following specifications:

Title: ${formData.title}
Description: ${formData.description}
Category: ${formData.category}
Language: ${formData.language}
Theme: ${formData.theme}
Color Scheme: ${formData.color_scheme}

Generate a complete HTML page with embedded CSS that includes:
- Modern, responsive design with mobile-first approach
- Professional typography and spacing
- Relevant content sections for a ${formData.category} website
- Navigation menu, hero section, content areas, and footer
- CSS animations and hover effects
- Proper semantic HTML structure
- Color scheme based on ${formData.color_scheme} colors
- Content in ${formData.language} language (if not English)

Make it production-ready and visually stunning. Include placeholder content that matches the website purpose.`;

      const result = await InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            html_content: { type: "string" },
            css_content: { type: "string" },
            description: { type: "string" }
          }
        }
      });

      const website = await Website.create({
        ...formData,
        html_content: result.html_content,
        css_content: result.css_content,
        generation_prompt: prompt,
        status: "completed"
      });

      setGeneratedWebsite(website);
      loadRecentProjects();
    } catch (error) {
      console.error("Error generating website:", error);
      alert("Failed to generate website. Please try again.");
    }
    setIsGenerating(false);
  };

  const downloadWebsite = () => {
    if (!generatedWebsite) return;

    const htmlContent = generatedWebsite.html_content;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedWebsite.title.replace(/\s+/g, '-').toLowerCase()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <Card className="w-full max-w-md bg-white/10 backdrop-blur-xl border-white/20">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">Welcome to WebCraft AI</h2>
            <p className="text-gray-300 mb-6">Sign in to start creating beautiful websites with artificial intelligence</p>
            <Button 
              onClick={() => User.login()}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600"
            >
              Sign in with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center lg:text-left"
          >
            <h1 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              Create Amazing Websites
              <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent"> with AI</span>
            </h1>
            <p className="text-xl text-gray-300 mb-6">
              Describe your vision, and watch as AI crafts a beautiful, responsive website in seconds
            </p>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Generator Form */}
          <div className="space-y-6">
            <GeneratorForm
              formData={formData}
              setFormData={setFormData}
              onGenerate={generateWebsite}
              isGenerating={isGenerating}
            />

            <QuickTemplates onTemplateSelect={setFormData} />

            {/* Recent Projects */}
            {recentProjects.length > 0 && (
              <Card className="bg-white/5 backdrop-blur-xl border-white/20">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    Recent Projects
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recentProjects.map((project) => (
                      <div key={project.id} className="p-3 bg-white/5 rounded-lg">
                        <h4 className="font-medium text-white">{project.title}</h4>
                        <p className="text-sm text-gray-300 mb-2">{project.description}</p>
                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs border-white/20 text-gray-300">
                            {project.category}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-indigo-400 hover:text-white hover:bg-white/10"
                            onClick={() => setGeneratedWebsite(project)}
                          >
                            <Eye className="w-4 h-4 mr-1" />
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Preview Panel */}
          <PreviewPanel 
            website={generatedWebsite}
            onDownload={downloadWebsite}
            isGenerating={isGenerating}
          />
        </div>
      </div>
    </div>
  );
}