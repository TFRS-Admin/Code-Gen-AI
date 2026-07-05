import React, { useState, useMemo, useEffect, useCallback } from "react";
import { BlairAPI } from "@/api/blair";
import { Input } from "@/components/ui/input";
import { ComponentPreview } from "@/components/ComponentPreview";
import { Loader2 } from "lucide-react";

// Registry entries carry metadata only (name, category, license, tfrsClasses)
// — the harvester's fetch() step (docs/06-component-harvester.md) that pulls
// real source files isn't implemented yet, so preview a representative
// generic snippet per category instead of the component's actual source.
const EXAMPLE_CODE_BY_CATEGORY = {
  form: '<button className="bg-blue-500 text-white hover:bg-blue-600 rounded-lg px-4 py-2 shadow-md">\n  Click me\n</button>',
  "data-display":
    '<div className="bg-white border-gray-200 rounded-lg shadow-md p-4">\n  <p className="text-gray-900 font-semibold">Status</p>\n  <p className="text-gray-500 text-sm">All systems nominal</p>\n</div>',
  overlay:
    '<div className="bg-white text-gray-900 rounded-lg shadow-xl p-6">\n  <h2 className="font-bold text-xl">Confirm action</h2>\n  <p className="text-gray-600 text-sm">This cannot be undone.</p>\n</div>',
  navigation:
    '<nav className="bg-gray-50 border-gray-200 rounded-md p-2">\n  <a className="text-blue-600 hover:bg-gray-100 rounded-md px-3 py-2">Overview</a>\n</nav>',
  feedback:
    '<div className="bg-gray-100 border-gray-300 rounded-md p-3">\n  <p className="text-gray-600 text-sm">Warning: check configuration</p>\n</div>',
  layout:
    '<div className="bg-white border-gray-200 rounded-lg p-6">\n  <div className="space-y-2">Panel content</div>\n</div>',
  "marketing-section":
    '<section className="bg-white text-gray-900">\n  <h1 className="font-bold text-xl">Welcome</h1>\n  <button className="bg-blue-500 text-white hover:bg-blue-600 rounded-lg px-5 py-3">Get started</button>\n</section>',
};
const DEFAULT_EXAMPLE_CODE =
  '<div className="bg-white text-gray-900 border-gray-200 rounded-lg shadow-md p-4">\n  Example content\n</div>';

function getExampleCode(component) {
  return EXAMPLE_CODE_BY_CATEGORY[component.category] || DEFAULT_EXAMPLE_CODE;
}

export default function ComponentHarvester() {
  const [searchQuery, setSearchQuery] = useState("");
  const [components, setComponents] = useState([]);
  const [loadingComponents, setLoadingComponents] = useState(true);
  const [listError, setListError] = useState(null);

  const [selectedComponent, setSelectedComponent] = useState(null);
  const [originalCode, setOriginalCode] = useState("");
  const [adaptedCode, setAdaptedCode] = useState("");
  const [tfrsClasses, setTfrsClasses] = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingComponents(true);
    BlairAPI.getRegistryComponents()
      .then((data) => {
        if (!cancelled) setComponents(data || []);
      })
      .catch((err) => {
        if (!cancelled) setListError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingComponents(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredComponents = useMemo(() => {
    if (!searchQuery.trim()) return components;
    const q = searchQuery.toLowerCase();
    return components.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );
  }, [components, searchQuery]);

  const handleSelectComponent = useCallback(async (component) => {
    setSelectedComponent(component);
    setLoadingPreview(true);
    setPreviewError(null);
    const exampleCode = getExampleCode(component);
    setOriginalCode(exampleCode);
    try {
      const data = await BlairAPI.adaptComponent(exampleCode, component.id);
      setAdaptedCode(data.adaptedCode);
      setTfrsClasses(data.tfrsClasses);
    } catch (err) {
      setPreviewError(err.message);
    } finally {
      setLoadingPreview(false);
    }
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-mono font-bold uppercase tracking-wide text-tfrs-text">Component Harvester</h1>
        <p className="text-sm text-tfrs-muted mt-1">Browse the registry and preview TFRS-adapted components.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: component list */}
        <div className="lg:col-span-1 space-y-4">
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-tfrs-bg border-tfrs-border text-tfrs-text font-mono"
          />

          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {loadingComponents ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-tfrs-muted" />
              </div>
            ) : listError ? (
              <p className="text-sm text-tfrs-red text-center py-8">{listError}</p>
            ) : filteredComponents.length === 0 ? (
              <p className="text-sm text-tfrs-muted text-center py-8">No components found</p>
            ) : (
              filteredComponents.map((component) => (
                <button
                  type="button"
                  key={component.id}
                  onClick={() => handleSelectComponent(component)}
                  className={`w-full text-left p-4 border transition-colors ${
                    selectedComponent?.id === component.id
                      ? "border-tfrs-red bg-black/20"
                      : "border-tfrs-border hover:border-tfrs-border-strong"
                  }`}
                >
                  <h3 className="font-mono font-semibold text-sm text-tfrs-text">{component.name}</h3>
                  <p className="text-xs text-tfrs-muted uppercase tracking-wide">{component.category}</p>
                  <p className="text-xs text-tfrs-steel">{component.source}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: preview */}
        <div className="lg:col-span-2">
          {previewError ? (
            <div className="bg-tfrs-surface border border-tfrs-border p-6 text-tfrs-red text-sm">{previewError}</div>
          ) : selectedComponent && !loadingPreview ? (
            <ComponentPreview
              componentId={selectedComponent.id}
              originalCode={originalCode}
              adaptedCode={adaptedCode}
              tfrsClasses={tfrsClasses}
              componentName={selectedComponent.name}
            />
          ) : loadingPreview ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-tfrs-muted" />
            </div>
          ) : (
            <div className="bg-tfrs-surface border border-tfrs-border p-8 text-center text-tfrs-muted">
              Select a component to preview its TFRS adaptation.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
