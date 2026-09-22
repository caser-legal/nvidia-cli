// Vision Analysis Tool - Nemotron Nano VL 12B v2
// Analyzes iOS screenshots, UI mockups, Xcode previews for layout issues
// Model: nvidia/nemotron-nano-12b-v2-vl (128K context, up to 5 images)

import { BaseTool } from "../base-tool";
import * as fs from "fs";
import * as path from "path";
import { NVIDIA_API_KEY } from "../../api-key";

const VLM_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const VLM_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";

// Supported formats per NVIDIA docs
const SUPPORTED_FORMATS: Record<string, [string, string]> = {
  png: ["image/png", "image_url"],
  jpg: ["image/jpeg", "image_url"],
  jpeg: ["image/jpeg", "image_url"],
  webp: ["image/webp", "image_url"],
  mp4: ["video/mp4", "video_url"],
  mov: ["video/mov", "video_url"],
  webm: ["video/webm", "video_url"],
};

interface VLMResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

/**
 * Analyze images using Nemotron Nano VL 12B v2
 * Supports up to 5 images or 1 video per request
 */
export class VisionAnalysisTool extends BaseTool {
  name = "vision_analyze";
  description = `Analyze iOS screenshots, UI mockups, or Xcode previews using NVIDIA Nemotron Nano VL 12B v2.
Detects: misaligned buttons, spacing issues, centering problems, layout inconsistencies, accessibility issues.
Supports: PNG, JPG, WEBP images (up to 5), or single MP4/MOV/WEBM video.
Use for: UI review, mockup vs implementation comparison, design system compliance checks.`;

  parameters = {
    image_paths: {
      type: "array",
      items: { type: "string" },
      description: "Array of absolute paths to images/video to analyze (max 5 images or 1 video)",
    },
    query: {
      type: "string",
      description: "What to analyze - e.g., 'Check button alignment and spacing', 'Compare these two screens for consistency', 'Find all UI issues'",
    },
    enable_reasoning: {
      type: "boolean",
      description: "Enable extended reasoning (/think) for deeper analysis. Default true for images, false for video.",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const imagePaths = args.image_paths as string[];
    const query = args.query as string;
    const enableReasoning = args.enable_reasoning as boolean | undefined;

    if (!imagePaths || imagePaths.length === 0) {
      return "Error: No image paths provided. Provide at least one image or video path.";
    }

    if (!query) {
      return "Error: No query provided. Specify what to analyze.";
    }

    if (!NVIDIA_API_KEY) {
      return "Error: NVIDIA_API_KEY not set in environment.";
    }

    // Validate and encode all media files
    const mediaContent: Array<Record<string, unknown>> = [];
    let hasVideo = false;

    for (const imagePath of imagePaths) {
      const resolvedPath = imagePath.startsWith("~")
        ? imagePath.replace("~", process.env.HOME || "")
        : imagePath;

      if (!fs.existsSync(resolvedPath)) {
        return `Error: File not found: ${resolvedPath}`;
      }

      const ext = path.extname(resolvedPath).slice(1).toLowerCase();
      const formatInfo = SUPPORTED_FORMATS[ext];

      if (!formatInfo) {
        return `Error: Unsupported format '${ext}'. Supported: ${Object.keys(SUPPORTED_FORMATS).join(", ")}`;
      }

      const [mimeType, mediaType] = formatInfo;

      if (mediaType === "video_url") {
        hasVideo = true;
        if (imagePaths.length > 1) {
          return "Error: Only single video supported. Cannot mix video with other files.";
        }
      }

      // Encode to base64
      const fileBuffer = fs.readFileSync(resolvedPath);
      const base64Data = fileBuffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      mediaContent.push({
        type: mediaType,
        [mediaType]: { url: dataUrl },
      });
    }

    if (imagePaths.length > 5) {
      return "Error: Maximum 5 images per request. Split into multiple calls.";
    }

    // Build content array: text query + media
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: query },
      ...mediaContent,
    ];

    // Determine reasoning mode
    // Videos don't support /think, images do
    const useReasoning = hasVideo ? false : (enableReasoning ?? true);
    const systemPrompt = useReasoning ? "/think" : "/no_think";

    const payload = {
      model: VLM_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
      max_tokens: 4096,
      temperature: 0.7,
      top_p: 0.95,
      stream: false,
    };

    try {
      const response = await fetch(VLM_ENDPOINT, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return `Error: VLM API returned ${response.status}: ${errorText}`;
      }

      const result = (await response.json()) as VLMResponse;
      const analysis = result.choices?.[0]?.message?.content;

      if (!analysis) {
        return "Error: No analysis returned from VLM.";
      }

      return `## Vision Analysis Results\n\n**Files analyzed:** ${imagePaths.join(", ")}\n**Reasoning:** ${useReasoning ? "enabled" : "disabled"}\n\n${analysis}`;
    } catch (error) {
      return `Error calling VLM API: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}

/**
 * Specialized tool for iOS UI review
 * Pre-configured prompts for common iOS UI issues
 */
export class iOSUIReviewTool extends BaseTool {
  name = "ios_ui_review";
  description = `Review iOS/SwiftUI screenshots for UI issues using vision AI.
Automatically checks: alignment, spacing, centering, safe areas, dynamic type, dark mode, accessibility.
Provide screenshot path(s) and optionally specify focus areas.`;

  parameters = {
    screenshot_paths: {
      type: "array",
      items: { type: "string" },
      description: "Paths to iOS simulator screenshots or Xcode preview images",
    },
    focus: {
      type: "string",
      description: "Optional focus area: 'alignment', 'spacing', 'colors', 'accessibility', 'all'",
      optional: true,
    },
    compare_to_mockup: {
      type: "string",
      description: "Optional path to design mockup to compare against",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const screenshotPaths = args.screenshot_paths as string[];
    const focus = (args.focus as string) || "all";
    const mockupPath = args.compare_to_mockup as string | undefined;

    if (!screenshotPaths || screenshotPaths.length === 0) {
      return "Error: No screenshot paths provided.";
    }

    // Build specialized iOS UI review prompt
    let query = `You are an expert iOS UI/UX reviewer. Analyze this SwiftUI screenshot for issues.

CHECK FOR:
`;

    if (focus === "all" || focus === "alignment") {
      query += `- ALIGNMENT: Are elements properly aligned? Check leading/trailing edges, center alignment, baseline alignment
- GRID: Do elements follow a consistent grid system?
`;
    }

    if (focus === "all" || focus === "spacing") {
      query += `- SPACING: Is spacing consistent? Check margins, padding, gaps between elements
- SAFE AREAS: Are elements respecting safe area insets (notch, home indicator)?
`;
    }

    if (focus === "all" || focus === "colors") {
      query += `- CONTRAST: Is text readable? Check contrast ratios
- DARK MODE: Would this work in dark mode? Any hardcoded colors?
`;
    }

    if (focus === "all" || focus === "accessibility") {
      query += `- TOUCH TARGETS: Are buttons at least 44x44 points?
- DYNAMIC TYPE: Would text scale properly?
- LABELS: Are interactive elements clearly labeled?
`;
    }

    if (mockupPath) {
      query += `
COMPARE: The first image is the implementation, the second is the design mockup.
Identify ALL differences between implementation and mockup.
`;
    }

    query += `
OUTPUT FORMAT:
1. List each issue found with severity (Critical/Major/Minor)
2. Provide specific fix recommendations
3. Note any SwiftUI modifiers that would help`;

    // Combine paths
    const allPaths = mockupPath ? [...screenshotPaths, mockupPath] : screenshotPaths;

    // Use the base vision tool
    const visionTool = new VisionAnalysisTool();
    return visionTool.execute({
      image_paths: allPaths,
      query,
      enable_reasoning: true,
    });
  }
}

/**
 * Compare mockup to implementation
 */
export class MockupComparisonTool extends BaseTool {
  name = "compare_mockup";
  description = `Compare a Figma/Sketch mockup to an iOS implementation screenshot.
Identifies pixel-level differences, spacing discrepancies, color mismatches, and missing elements.`;

  parameters = {
    mockup_path: {
      type: "string",
      description: "Path to the design mockup image (Figma export, Sketch, etc.)",
    },
    implementation_path: {
      type: "string",
      description: "Path to the iOS simulator screenshot or Xcode preview",
    },
    strict_mode: {
      type: "boolean",
      description: "If true, flag even minor differences. Default false.",
      optional: true,
    },
  };

  async execute(args: Record<string, unknown>): Promise<string> {
    const mockupPath = args.mockup_path as string;
    const implementationPath = args.implementation_path as string;
    const strictMode = (args.strict_mode as boolean) ?? false;

    if (!mockupPath || !implementationPath) {
      return "Error: Both mockup_path and implementation_path are required.";
    }

    const query = `You are a pixel-perfect UI reviewer comparing a design mockup to its iOS implementation.

IMAGE 1: Design mockup (the source of truth)
IMAGE 2: iOS implementation (what was built)

ANALYZE AND REPORT:

1. **Layout Differences**
   - Element positioning differences
   - Size/dimension mismatches
   - Missing or extra elements

2. **Spacing Issues**
   - Margin differences
   - Padding inconsistencies
   - Gap variations

3. **Typography**
   - Font size differences
   - Font weight mismatches
   - Line height/spacing issues

4. **Colors**
   - Color value differences (provide hex codes if visible)
   - Opacity mismatches
   - Gradient differences

5. **Visual Details**
   - Corner radius differences
   - Shadow/elevation mismatches
   - Border differences

${strictMode ? "FLAG ALL DIFFERENCES, even minor ones." : "Focus on noticeable differences that affect user experience."}

For each issue, provide:
- What's different
- Where it is (describe location)
- Suggested SwiftUI fix`;

    const visionTool = new VisionAnalysisTool();
    return visionTool.execute({
      image_paths: [mockupPath, implementationPath],
      query,
      enable_reasoning: true,
    });
  }
}
