import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { highlightCode } from "@/components/dashboard/codeHighlight";
import { Copy, Check } from "lucide-react";

const TAB_TRIGGER_CLASS =
  "rounded-sm text-xs font-mono uppercase tracking-wide text-tfrs-muted data-[state=active]:bg-tfrs-red data-[state=active]:text-tfrs-ink data-[state=active]:shadow-none";

export function ComponentPreview({
  componentId,
  originalCode,
  adaptedCode,
  tfrsClasses = [],
  componentName = "Component",
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(adaptedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-tfrs-surface border border-tfrs-border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-mono font-bold uppercase tracking-wide text-tfrs-text">{componentName}</h2>
        <p className="text-xs text-tfrs-muted mt-1">TFRS-adapted component preview</p>
      </div>

      <div>
        <h3 className="text-xs font-mono uppercase tracking-wide text-tfrs-gold mb-2">TFRS Classes Applied</h3>
        <div className="flex flex-wrap gap-2">
          {tfrsClasses.length === 0 ? (
            <span className="text-xs text-tfrs-muted">No TFRS classes detected.</span>
          ) : (
            tfrsClasses.map((cls) => (
              <Badge
                key={cls}
                variant="outline"
                className="bg-tfrs-bg text-tfrs-gold border-tfrs-border rounded-sm font-mono text-[11px] normal-case"
              >
                {cls}
              </Badge>
            ))
          )}
        </div>
      </div>

      <Tabs defaultValue="adapted" className="w-full">
        <TabsList className="bg-tfrs-bg border border-tfrs-border rounded-sm p-1 h-auto">
          <TabsTrigger value="adapted" className={TAB_TRIGGER_CLASS}>
            Adapted Code
          </TabsTrigger>
          <TabsTrigger value="original" className={TAB_TRIGGER_CLASS}>
            Original Code
          </TabsTrigger>
        </TabsList>

        <TabsContent value="adapted">
          <div className="relative">
            <pre className="blair-code-block p-4 pr-12 rounded-sm overflow-x-auto text-xs m-0">
              <code dangerouslySetInnerHTML={{ __html: highlightCode(adaptedCode) }} />
            </pre>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label="Copy adapted code"
              className="absolute top-2 right-2 bg-tfrs-surface border-tfrs-border-strong text-tfrs-text hover:bg-tfrs-surface-2"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="original">
          <pre className="blair-code-block p-4 rounded-sm overflow-x-auto text-xs m-0">
            <code dangerouslySetInnerHTML={{ __html: highlightCode(originalCode) }} />
          </pre>
        </TabsContent>
      </Tabs>

      {componentId && <p className="text-xs font-mono text-tfrs-muted">Component ID: {componentId}</p>}
    </div>
  );
}

export default ComponentPreview;
