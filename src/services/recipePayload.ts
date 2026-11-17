// Pure functions for the Gemini request: no React Native or Expo imports, so testable in Node.

export interface RecipeImagePart {
  base64: string;
  mimeType?: string;
  uri?: string;
}

// Subset of ParseRecipeInput (aiService) used for the payload; catalogNames deliberately does not appear here
export interface RecipePayloadInput {
  text?: string;
  url?: string;
  imageBase64?: string;
  imageMimeType?: string;
  images?: RecipeImagePart[];
  adapt?: boolean;
}

export interface GeminiRecipePayload {
  systemInstruction: { parts: { text: string }[] };
  contents: { parts: Record<string, unknown>[] }[];
  generationConfig: {
    temperature: number;
    responseMimeType: string;
    responseSchema: unknown;
  };
}

/** Product names from the seed (name field only). Used only for the local check, never for the request. */
export function namesFromSeed(seed: readonly { name: string }[]): string[] {
  return seed.map(item => item.name);
}

/** Names and aliases from the seed. Used only for the local check (matching), never for the request. */
export function namesAndAliasesFromSeed(seed: readonly { id?: string; name: string; aliases?: string[] }[]): {id?: string; name: string; aliases?: readonly string[]}[] {
  return seed.map(item => ({id: item.id, name: item.name, aliases: item.aliases}));
}

/**
 * Builds the Gemini payload. Uses only text, images and prompt: catalogNames are not read here.
 */
export function buildRecipeRequestPayload(
  input: RecipePayloadInput,
  schema: unknown,
  prompt: string
): GeminiRecipePayload {
  const contentsParts: Record<string, unknown>[] = [];

  const allImages: RecipeImagePart[] = input.images && input.images.length > 0
    ? input.images
    : input.imageBase64
      ? [{ base64: input.imageBase64, mimeType: input.imageMimeType || 'image/jpeg' }]
      : [];

  if (allImages.length > 0) {
    allImages.forEach(img => {
      contentsParts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      });
    });

    if (allImages.length === 1) {
      contentsParts.push({
        text: 'Extract and structure the complete recipe from the attached image (cookbook page, screenshot, handwritten note).'
      });
    } else {
      contentsParts.push({
        text: `These ${allImages.length} images are consecutive pages/photos of the SAME recipe from a cookbook or notebook (for example, page 1 might contain the title and ingredients, while page 2 contains directions, notes, or variations). Analyze, merge, and unite all information from all ${allImages.length} images into a single cohesive, high-quality, complete recipe.`
      });
    }
  }

  if (input.url) {
    contentsParts.push({
      text: `Extract and structure the recipe from this URL: ${input.url}`
    });
  }

  if (input.text) {
    contentsParts.push({
      text: input.adapt
        ? `Adapt this recipe as requested by the system instruction. Source recipe:\n\n${input.text}`
        : `Extract and structure the recipe from this text:\n\n${input.text}`
    });
  }

  return {
    systemInstruction: { parts: [{ text: prompt }] },
    contents: [{ parts: contentsParts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: schema
    }
  };
}
