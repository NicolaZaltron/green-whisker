// Funzioni pure per la richiesta a Gemini: nessun import di React Native o Expo, quindi testabili in Node.

export interface RecipeImagePart {
  base64: string;
  mimeType?: string;
  uri?: string;
}

// Sottoinsieme di ParseRecipeInput (aiService) usato per il payload; catalogNames non compare qui di proposito
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

/** Nomi di prodotto dal seed (solo il campo name). Usata solo per il controllo locale, mai per la richiesta. */
export function namesFromSeed(seed: readonly { name: string }[]): string[] {
  return seed.map(item => item.name);
}

/**
 * Costruisce il payload Gemini. Usa solo testo, immagini e prompt: i catalogNames non vengono letti qui.
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
