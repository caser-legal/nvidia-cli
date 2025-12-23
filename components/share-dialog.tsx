// Share Dialog Component
// Features 133-142: Share conversation functionality

"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/lib/store";
import { useConversationStore } from "@/lib/store/conversations";
import { Copy, Check, Globe, Lock, Calendar, Eye } from "lucide-react";
import { nanoid } from "nanoid";

export function ShareDialog() {
  const { shareDialogOpen, setShareDialogOpen } = useUIStore();
  const { getCurrentConversation } = useConversationStore();
  const conversation = getCurrentConversation();

  const [copied, setCopied] = React.useState(false);
  const [isPublic, setIsPublic] = React.useState(false);
  const [shareLink, setShareLink] = React.useState("");
  const [expiresIn, setExpiresIn] = React.useState<"1d" | "7d" | "30d" | "never">("7d");
  const [viewCount, setViewCount] = React.useState(0);

  // Generate share link
  React.useEffect(() => {
    if (shareDialogOpen && conversation) {
      const linkId = nanoid(10);
      setShareLink(`${window.location.origin}/share/${linkId}`);
      setViewCount(0); // Start at 0, would be fetched from server in real app
    }
  }, [shareDialogOpen, conversation]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = () => {
    setShareLink("");
    setShareDialogOpen(false);
  };

  if (!conversation) return null;

  return (
    <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Share Conversation</DialogTitle>
          <DialogDescription>
            Create a shareable link to this conversation
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Share Link */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Share Link</label>
            <div className="flex gap-2">
              <Input value={shareLink} readOnly className="flex-1" />
              <Button onClick={handleCopy} variant="outline">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* Public/Private Toggle */}
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              <span className="text-sm font-medium">
                {isPublic ? "Public" : "Private"} Link
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPublic(!isPublic)}
            >
              {isPublic ? "Make Private" : "Make Public"}
            </Button>
          </div>

          {/* Expiration */}
          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Link Expires
            </label>
            <div className="flex gap-2">
              {(["1d", "7d", "30d", "never"] as const).map((exp) => (
                <Button
                  key={exp}
                  variant={expiresIn === exp ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExpiresIn(exp)}
                >
                  {exp === "never" ? "Never" : exp === "1d" ? "1 Day" : exp === "7d" ? "7 Days" : "30 Days"}
                </Button>
              ))}
            </div>
          </div>

          {/* View Count */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Eye className="h-4 w-4" />
            <span>{viewCount} views</span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button variant="destructive" onClick={handleRevoke} className="flex-1">
              Revoke Link
            </Button>
            <Button onClick={() => setShareDialogOpen(false)} className="flex-1">
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
