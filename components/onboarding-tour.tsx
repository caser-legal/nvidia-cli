// Onboarding Tour Component
// Features 166, 169-170, 172: Feature tour and tutorials

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
import { useSettingsStore } from "@/lib/store";
import {
  MessageSquare,
  Sparkles,
  FolderOpen,
  Settings,
  Keyboard,
  Zap,
  ChevronRight,
  ChevronLeft,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TOUR_STEPS = [
  {
    title: "Welcome to NVIDIA Chat",
    description: "A powerful AI chat interface powered by NVIDIA NIM. Let's take a quick tour of the features.",
    icon: Sparkles,
  },
  {
    title: "Start Conversations",
    description: "Click 'New Chat' to start a conversation. Your chats are automatically saved and organized by date.",
    icon: MessageSquare,
  },
  {
    title: "Organize with Projects",
    description: "Create projects to group related conversations. Each project can have its own custom instructions.",
    icon: FolderOpen,
  },
  {
    title: "Keyboard Shortcuts",
    description: "Use ⌘K to open the command palette, ⌘N for new chat, and ⌘, for settings. Press ⌘/ to toggle the sidebar.",
    icon: Keyboard,
  },
  {
    title: "Customize Your Experience",
    description: "Open Settings to change themes, adjust font sizes, and configure your API key.",
    icon: Settings,
  },
  {
    title: "Best Practices",
    description: "Be specific in your prompts. Use the model selector to choose the best model for your task. Try different temperatures for creative vs. precise outputs.",
    icon: Zap,
  },
];

export function OnboardingTour() {
  const { onboardingComplete, onboardingStep, setOnboardingComplete, updateSettings } = useSettingsStore();
  const [currentStep, setCurrentStep] = React.useState(onboardingStep);
  const [isOpen, setIsOpen] = React.useState(!onboardingComplete);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
      updateSettings({ onboardingStep: currentStep + 1 });
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      updateSettings({ onboardingStep: currentStep - 1 });
    }
  };

  const handleComplete = () => {
    setOnboardingComplete(true);
    setIsOpen(false);
  };

  const handleSkip = () => {
    setOnboardingComplete(true);
    setIsOpen(false);
  };

  // Feature 172: Resume onboarding
  const handleResume = () => {
    setIsOpen(true);
    setCurrentStep(onboardingStep);
  };

  if (onboardingComplete && !isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md">
        {/* Skip button in top right */}
        <button
          onClick={handleSkip}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="text-center py-6">
          <div className="w-16 h-16 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
            <Icon className="h-8 w-8 text-primary" />
          </div>
          
          <DialogHeader className="text-center">
            <DialogTitle className="text-xl">{step.title}</DialogTitle>
            <DialogDescription className="mt-2">
              {step.description}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-4">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                i === currentStep ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          
          <Button onClick={handleNext}>
            {currentStep === TOUR_STEPS.length - 1 ? (
              "Get Started"
            ) : (
              <>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
