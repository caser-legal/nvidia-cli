// Artifact Panel Component
// Features 26-45: Artifact rendering and management

"use client";

import * as React from "react";
import {
  X,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Code,
  FileText,
  Image,
  Play,
  Check,
  Edit3,
  GitFork,
  History,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn, copyToClipboard, sanitizeHTML } from "@/lib/utils";
import type { Artifact } from "@/lib/store/conversations";

interface ArtifactPanelProps {
  artifact: Artifact;
  onClose: () => void;
  onUpdate?: (content: string) => void;
  onReprompt?: (prompt: string) => void;
  onFork?: () => void;
}

export function ArtifactPanel({ artifact, onClose, onUpdate, onReprompt, onFork }: ArtifactPanelProps) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"preview" | "code" | "edit">("preview");
  const [editContent, setEditContent] = React.useState(artifact.content);
  const [repromptText, setRepromptText] = React.useState("");
  const [showHistory, setShowHistory] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Update edit content when artifact changes
  React.useEffect(() => {
    setEditContent(artifact.content);
  }, [artifact.content]);

  // Feature 44: Copy artifact content
  const handleCopy = async () => {
    const success = await copyToClipboard(artifact.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Feature 37: Download artifact
  const handleDownload = () => {
    const extension = getFileExtension(artifact.type, artifact.language);
    const filename = `${artifact.title.replace(/\s+/g, "-").toLowerCase()}${extension}`;
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Feature 36: Toggle fullscreen
  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Feature 34: Save edited content
  const handleSaveEdit = () => {
    if (onUpdate && editContent !== artifact.content) {
      onUpdate(editContent);
    }
    setActiveTab("preview");
  };

  // Feature 35: Re-prompt artifact
  const handleReprompt = () => {
    if (onReprompt && repromptText.trim()) {
      onReprompt(repromptText);
      setRepromptText("");
    }
  };

  // Get appropriate icon for artifact type
  const getIcon = () => {
    switch (artifact.type) {
      case "code":
        return <Code className="h-4 w-4" />;
      case "html":
      case "svg":
        return <Image className="h-4 w-4" />;
      case "react":
        return <Play className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Render preview based on type
  const renderPreview = () => {
    switch (artifact.type) {
      // Feature 29: HTML live preview
      case "html":
        return (
          <iframe
            ref={iframeRef}
            srcDoc={sanitizeHTML(artifact.content)}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts"
            title="HTML Preview"
          />
        );

      // Feature 30: SVG live preview
      case "svg":
        return (
          <div
            className="w-full h-full flex items-center justify-center bg-white p-4"
            dangerouslySetInnerHTML={{ __html: sanitizeHTML(artifact.content) }}
          />
        );

      // Feature 31: React component preview (simplified)
      case "react":
        return (
          <div className="w-full h-full flex items-center justify-center bg-muted p-4">
            <div className="text-center text-muted-foreground">
              <Play className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>React preview requires a sandbox environment</p>
              <p className="text-sm">View the code tab to see the component</p>
            </div>
          </div>
        );

      // Feature 32: Mermaid diagram rendering
      case "mermaid":
        return (
          <div className="w-full h-full flex items-center justify-center bg-white p-4">
            <div className="text-center text-muted-foreground">
              <p>Mermaid diagram</p>
              <pre className="text-xs mt-2 text-left bg-muted p-2 rounded">
                {artifact.content}
              </pre>
            </div>
          </div>
        );

      // Feature 33: Text document
      case "text":
      case "markdown":
        return (
          <ScrollArea className="h-full">
            <div className="p-4 prose prose-sm dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans">{artifact.content}</pre>
            </div>
          </ScrollArea>
        );

      // Feature 28: Code preview
      case "code":
      default:
        return (
          <ScrollArea className="h-full">
            <SyntaxHighlighter
              language={artifact.language || "text"}
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                minHeight: "100%",
              }}
              showLineNumbers
            >
              {artifact.content}
            </SyntaxHighlighter>
          </ScrollArea>
        );
    }
  };

  return (
    <div
      className={cn(
        "artifact-panel open",
        isFullscreen && "fixed inset-0 w-full z-50"
      )}
      role="dialog"
      aria-label="Artifact panel"
    >
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          {/* Feature 41: Artifact type badge */}
          <div className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md">
            {getIcon()}
            <span className="text-sm font-medium">{artifact.type}</span>
          </div>
          <span className="font-medium truncate max-w-[200px]">{artifact.title}</span>
          {/* Feature 38: Version indicator */}
          {artifact.version > 1 && (
            <span className="text-xs text-muted-foreground">v{artifact.version}</span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Feature 39: History button */}
          <Button variant="ghost" size="icon" onClick={() => setShowHistory(!showHistory)} title="Version history">
            <History className="h-4 w-4" />
          </Button>

          {/* Feature 45: Fork button */}
          {onFork && (
            <Button variant="ghost" size="icon" onClick={onFork} title="Fork artifact">
              <GitFork className="h-4 w-4" />
            </Button>
          )}

          {/* Feature 44: Copy button */}
          <Button variant="ghost" size="icon" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>

          {/* Feature 37: Download button */}
          <Button variant="ghost" size="icon" onClick={handleDownload}>
            <Download className="h-4 w-4" />
          </Button>

          {/* Feature 36: Fullscreen toggle */}
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>

          {/* Feature 42: Close button */}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Feature 40: Tabs for preview/code/edit */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "preview" | "code" | "edit")} className="flex-1 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-10">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
            <TabsTrigger value="edit">
              <Edit3 className="h-3 w-3 mr-1" />
              Edit
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="preview" className="flex-1 m-0">
          {renderPreview()}
        </TabsContent>

        <TabsContent value="code" className="flex-1 m-0">
          <ScrollArea className="h-full">
            <SyntaxHighlighter
              language={artifact.language || "text"}
              style={oneDark}
              customStyle={{
                margin: 0,
                borderRadius: 0,
                minHeight: "100%",
              }}
              showLineNumbers
            >
              {artifact.content}
            </SyntaxHighlighter>
          </ScrollArea>
        </TabsContent>

        {/* Feature 34: Edit tab */}
        <TabsContent value="edit" className="flex-1 m-0 flex flex-col">
          <div className="flex-1 p-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="h-full min-h-[300px] font-mono text-sm"
              placeholder="Edit artifact content..."
            />
          </div>
          <div className="p-4 border-t flex gap-2">
            <Button variant="outline" onClick={() => setEditContent(artifact.content)} className="flex-1">
              Reset
            </Button>
            <Button onClick={handleSaveEdit} className="flex-1">
              Save Changes
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      {/* Feature 35: Re-prompt section */}
      {onReprompt && (
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Textarea
              value={repromptText}
              onChange={(e) => setRepromptText(e.target.value)}
              placeholder="Describe changes you want to make..."
              className="min-h-[60px]"
            />
            <Button onClick={handleReprompt} disabled={!repromptText.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Feature 39: History panel */}
      {showHistory && (
        <div className="absolute right-0 top-14 bottom-0 w-64 bg-background border-l p-4">
          <h3 className="font-medium mb-4">Version History</h3>
          <div className="space-y-2">
            {Array.from({ length: artifact.version }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "p-2 rounded-md cursor-pointer hover:bg-muted",
                  i === artifact.version - 1 && "bg-muted"
                )}
              >
                <div className="text-sm font-medium">Version {i + 1}</div>
                <div className="text-xs text-muted-foreground">
                  {i === artifact.version - 1 ? "Current" : "Previous"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to get file extension
function getFileExtension(type: string, language?: string): string {
  switch (type) {
    case "html":
      return ".html";
    case "svg":
      return ".svg";
    case "react":
      return ".tsx";
    case "mermaid":
      return ".mmd";
    case "markdown":
      return ".md";
    case "code":
      switch (language) {
        case "javascript":
          return ".js";
        case "typescript":
          return ".ts";
        case "python":
          return ".py";
        case "css":
          return ".css";
        case "json":
          return ".json";
        default:
          return ".txt";
      }
    default:
      return ".txt";
  }
}
