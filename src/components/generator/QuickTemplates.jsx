import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap } from "lucide-react";

const templates = [
  {
    title: "Tech Startup",
    description: "Modern SaaS landing page with pricing and features",
    category: "startup",
    theme: "modern",
    color_scheme: "blue"
  },
  {
    title: "Restaurant Menu", 
    description: "Elegant restaurant website with menu and reservations",
    category: "restaurant",
    theme: "elegant",
    color_scheme: "orange"
  },
  {
    title: "Creative Portfolio",
    description: "Artist portfolio showcasing creative work and services",
    category: "portfolio", 
    theme: "creative",
    color_scheme: "purple"
  },
  {
    title: "Business Consulting",
    description: "Professional consulting firm with services and contact",
    category: "business",
    theme: "corporate",
    color_scheme: "gray"
  }
];

export default function QuickTemplates({ onTemplateSelect }) {
  const handleTemplateSelect = (template) => {
    onTemplateSelect(prev => ({
      ...prev,
      ...template
    }));
  };

  return (
    <Card className="bg-white/5 backdrop-blur-xl border-white/20">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Zap className="w-5 h-5" />
          Quick Templates
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {templates.map((template, index) => (
            <Button
              key={index}
              variant="ghost"
              onClick={() => handleTemplateSelect(template)}
              className="h-auto p-3 justify-start text-left hover:bg-white/10 border border-white/10"
            >
              <div>
                <p className="font-medium text-white">{template.title}</p>
                <p className="text-xs text-gray-400 mt-1">{template.description}</p>
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}