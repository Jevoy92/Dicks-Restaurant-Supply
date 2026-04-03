import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5, initialDelay = 2000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Extract error details, handling potential nested structures
      const errorCode = error?.code || error?.error?.code || error?.status;
      const errorMessage = error?.message || error?.error?.message || "";
      const errorStatus = error?.status || error?.error?.status || "";

      // Check for 503 Service Unavailable or 429 Too Many Requests
      const isRetryable = 
        errorStatus === 'UNAVAILABLE' || 
        errorCode === 503 || 
        errorStatus === 'RESOURCE_EXHAUSTED' ||
        errorCode === 429 ||
        errorMessage.toLowerCase().includes('high demand') ||
        errorMessage.toLowerCase().includes('overloaded');
      
      if (isRetryable && i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(`Gemini API busy (attempt ${i + 1}/${maxRetries}). Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const DICKS_URL = "https://dicksrestaurantsupply.com";
const LOCATIONS = ["Seattle", "Bellevue", "Mount Vernon"];

export interface ContentOutput {
  topicAngle: string;
  youtubeScript: string;
  shortScript: string;
  blogPost: string;
  socialPost: string;
  filmingPlan: string;
  imagePrompt: string;
}

export interface Suggestion {
  title: string;
  description: string;
  rawInput: string;
}

const SYSTEM_PROMPT = `You are the Lead Content Strategist for Dick's Restaurant Supply. 
Dick's has 3 primary locations: Seattle, Bellevue, and Mount Vernon.
Your goal is to turn raw business activities into high-performing content that establishes Dick's as the ultimate authority in restaurant operations.

Tone: Professional, authoritative, helpful, and efficient.`;

export async function generateContent(input: string): Promise<ContentOutput> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Transform this business activity into a full content strategy for Dick's Restaurant Supply: "${input}"`,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}
        
        Output must be JSON with the following fields:
        - topicAngle: A strategic hook that explains WHY this matters to a restaurant owner.
        - youtubeScript: A FULL, word-for-word YouTube script (not an outline). Include INTRO, BODY, and OUTRO.
        - shortScript: A punchy 60-second script for Reels/TikTok/Shorts.
        - blogPost: A detailed 500-word blog post for the Dick's website.
        - socialPost: A high-engagement LinkedIn/Facebook post.
        - filmingPlan: A step-by-step execution plan for the team on-site. Format as a numbered list.
        - imagePrompt: A highly detailed prompt for an AI image generator to create a professional hero image for this content. The image MUST visually represent the key themes discussed in the YouTube script and blog post.`,
        tools: [{ urlContext: {} }, { googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topicAngle: { type: Type.STRING },
            youtubeScript: { type: Type.STRING },
            shortScript: { type: Type.STRING },
            blogPost: { type: Type.STRING },
            socialPost: { type: Type.STRING },
            filmingPlan: { type: Type.STRING },
            imagePrompt: { type: Type.STRING },
          },
          required: ["topicAngle", "youtubeScript", "shortScript", "blogPost", "socialPost", "filmingPlan", "imagePrompt"],
        },
      },
    });

    return JSON.parse(response.text || "{}");
  });
}

export async function generateImage(prompt: string): Promise<string> {
  return withRetry(async () => {
    const imageAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });
    const response = await imageAi.models.generateContent({
      model: 'gemini-3-flash-image-preview',
      contents: {
        parts: [{ text: prompt }],
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "1K"
        },
      },
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    throw new Error("No image generated");
  });
}



export async function generateDirections(input: string): Promise<string[]> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Provide 3 distinct strategic content directions for this activity at Dick's Restaurant Supply: "${input}"`,
      config: {
        systemInstruction: `${SYSTEM_PROMPT} Provide 3 short, punchy strategic directions. Return as a JSON array of strings.`,
        tools: [{ urlContext: {} }, { googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  });
}

export async function getInitialSuggestions(userName: string | null = null, history: any[] = []): Promise<Suggestion[]> {
  return withRetry(async () => {
    const historyContext = history.length > 0 
      ? `\n\nUser's Past History:\n${history.slice(0, 5).map(h => `- ${h.input}`).join('\n')}\n\nMake sure the suggestions are personalized based on this history, but also introduce new ideas.`
      : '';
      
    const greeting = userName ? `Personalize the suggestions for ${userName}. ` : '';

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `${greeting}Based on the current content and products at ${DICKS_URL}, suggest 6 diverse "Recent Activity" starters that the team could use to generate content today. 
      Cover different categories like Seasonal, Maintenance, Upgrades, Operations, Trends, and Customer Success.${historyContext}`,
      config: {
        systemInstruction: `${SYSTEM_PROMPT} 
        Return a JSON array of 6 objects, each with:
        - title: A short catchy title for the suggestion.
        - description: A brief explanation of why this is a good post today.
        - rawInput: A one-sentence starter that the user can click to use as input.`,
        tools: [{ urlContext: {} }, { googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              rawInput: { type: Type.STRING }
            },
            required: ["title", "description", "rawInput"]
          }
        }
      }
    });
    return JSON.parse(response.text || "[]");
  });
}

export interface PlannedPost {
  id: string;
  date: string; // ISO string
  platform: 'youtube' | 'linkedin' | 'instagram' | 'facebook';
  type: 'video' | 'article' | 'carousel' | 'photo';
  title: string;
  time: string;
  status: 'draft' | 'in review' | 'scheduled' | 'posted';
  content?: string;
}

export async function generateSinglePost(post: PlannedPost, tone: string, audience: string, location: string): Promise<string> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Write a ${post.platform} post for Dick's Restaurant Supply.
      Post Type: ${post.type}
      Topic/Title: ${post.title}
      Tone: ${tone}
      Target Audience: ${audience}
      Location Context: ${location}
      
      If this is a video script (like YouTube or Short), provide a FULL, word-for-word script, not an outline. Include INTRO, BODY, and OUTRO.
      If this is a social post, include relevant hashtags.
      Make it engaging, professional, and ready to publish. Do not include placeholder text.`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        tools: [{ googleSearch: {} }]
      }
    });
    return response.text || "";
  });
}

export async function generateMonthPlan(focus: string, location: string): Promise<PlannedPost[]> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a 30-day content calendar for Dick's Restaurant Supply focusing on "${focus}" at the ${location} location. 
      Spread the posts across YouTube, LinkedIn, Instagram, and Facebook. 
      Include a mix of videos, articles, carousels, and photos.`,
      config: {
        systemInstruction: `${SYSTEM_PROMPT} 
        Return a JSON array of 30 objects, each with:
        - date: The day of the month (1-30).
        - platform: one of ['youtube', 'linkedin', 'instagram', 'facebook'].
        - type: one of ['video', 'article', 'carousel', 'photo'].
        - title: A catchy title for the post.
        - time: A suggested posting time (e.g., "9:00 AM").`,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              date: { type: Type.INTEGER },
              platform: { type: Type.STRING, enum: ['youtube', 'linkedin', 'instagram', 'facebook'] },
              type: { type: Type.STRING, enum: ['video', 'article', 'carousel', 'photo'] },
              title: { type: Type.STRING },
              time: { type: Type.STRING }
            },
            required: ["date", "platform", "type", "title", "time"]
          }
        }
      }
    });

    const rawPosts = JSON.parse(response.text || "[]");
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    return rawPosts.map((p: any) => ({
      id: crypto.randomUUID(),
      date: new Date(year, month, p.date).toISOString(),
      platform: p.platform,
      type: p.type,
      title: p.title,
      time: p.time,
      status: Math.random() > 0.8 ? 'in review' : 'draft' // Randomly assign some to review for visual variety
    }));
  });
}
