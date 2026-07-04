import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eye, Download, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function PreviewPanel({ website, onDownload, isGenerating }) {
  if (isGenerating) {
    return (
      <Card className="bg-white/5 backdrop-blur-xl border-white/20">
        <CardContent className="p-12 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center"
          >
            <Sparkles className="w-8 h-8 text-white" />
          </motion.div>
          <h3 className="text-xl font-semibold text-white mb-2">
            Creating Your Website...
          </h3>
          <p className="text-gray-300">
            Our AI is crafting a beautiful, responsive website just for you. This may take a few moments.
          </p>
          <div className="mt-6">
            <div className="bg-white/10 rounded-full h-2 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 3, repeat: Infinity }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!website) {
    return (
      <Card className="bg-white/5 backdrop-blur-xl border-white/20">
        <CardContent className="p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 bg-white/10 rounded-full flex items-center justify-center">
            <Eye className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">Preview Area</h3>
          <p className="text-gray-300">
            Your generated website will appear here. Fill out the form and click "Generate Website" to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="bg-white/5 backdrop-blur-xl border-white/20">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Eye className="w-5 h-5" />
            Preview
          </CardTitle>
          <Button
            onClick={onDownload}
            size="sm"
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="bg-white rounded-lg overflow-hidden">
            <div className="h-96 lg:h-[500px]">
              <iframe
                srcDoc={website.html_content}
                className="w-full h-full border-0"
                title="Website Preview"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}