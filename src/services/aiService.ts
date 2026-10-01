import { Recipe, SlotConsigliato, GruppoAlimentare } from '../types/recipe';

export type AIProvider = 'gemini' | 'openai' | 'claude' | 'openrouter' | 'custom';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function getAIConfig(): AIConfig {
  // Expo requires direct static member access on process.env.EXPO_PUBLIC_* for Metro AST inlining
  const provider = ((process.env.EXPO_PUBLIC_AI_PROVIDER || 'gemini').toLowerCase()) as AIProvider;
  
  if (provider === 'openai') {
    return {
      provider: 'openai',
      apiKey: process.env.EXPO_PUBLIC_OPENAI_API_KEY || '',
      model: process.env.EXPO_PUBLIC_AI_MODEL || 'gpt-4o-mini',
      baseUrl: process.env.EXPO_PUBLIC_AI_BASE_URL || 'https://api.openai.com/v1'
    };
  }

  if (provider === 'claude') {
    return {
      provider: 'claude',
      apiKey: process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '',
      model: process.env.EXPO_PUBLIC_AI_MODEL || 'claude-3-5-sonnet-20241022'
    };
  }

  if (provider === 'openrouter') {
    return {
      provider: 'openrouter',
      apiKey: process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '',
      model: process.env.EXPO_PUBLIC_AI_MODEL || 'deepseek/deepseek-chat',
      baseUrl: 'https://openrouter.ai/api/v1'
    };
  }

  if (provider === 'custom') {
    return {
      provider: 'custom',
      apiKey: process.env.EXPO_PUBLIC_AI_API_KEY || '',
      model: process.env.EXPO_PUBLIC_AI_MODEL || 'llama3.2',
      baseUrl: process.env.EXPO_PUBLIC_AI_BASE_URL || 'http://localhost:11434/v1'
    };
  }

  // Default: Gemini
  return {
    provider: 'gemini',
    apiKey: process.env.EXPO_PUBLIC_GEMINI_API_KEY || '',
    model: process.env.EXPO_PUBLIC_AI_MODEL || 'gemini-3.5-flash'
  };
}

/**
 * Resilient fetch wrapper with AbortController timeout to prevent hanging UI
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 35000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Richiesta scaduta (${Math.round(timeoutMs / 1000)}s). Verifica la connessione internet.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

const VALID_CATEGORIES = [
  'Primi e Cereali',
  'Proteine Vegetali & Secondi',
  'Panificati e Piatti Unici',
  'Verdure e Contorni',
  'Dolci, Colazioni e Snack',
];

const VALID_SLOTS: SlotConsigliato[] = ['colazione', 'spuntino', 'pranzo_cena'];

const RECIPE_PROMPT_SYSTEM = `
You are an expert plant-based chef and culinary AI for the Italian vegan recipe app 'Green Whisker'.
Your task is to parse, extract, or format a complete 100% plant-based/vegan recipe from the provided text, URL, or image, and return EXCLUSIVELY a valid JSON object matching the required schema.

IMPORTANT LANGUAGE INSTRUCTION:
- All generated recipe fields (titolo, ingredienti, istruzioni, suggerimenti, etc.) MUST be written in natural, fluent Italian.

STRICT SCHEMA & PARSING RULES:
1. "titolo": Clean Italian recipe title (e.g., "Trofie al Pesto con Patate e Fagiolini"). Do not prepend unnecessary words or brand labels.
2. "categoria": MUST be exactly one of the 5 Macro-Categories:
   ["Primi e Cereali", "Proteine Vegetali & Secondi", "Panificati e Piatti Unici", "Verdure e Contorni", "Dolci, Colazioni e Snack"]
3. "macro_categoria": Exactly the same as "categoria".
4. "sottocategoria": Specific subcategory chosen accurately from the corresponding list:
   - For "Primi e Cereali": ["Primi piatti", "Risotti", "Gnocchi", "Pasta al forno", "Polenta", "Bowl", "Porridge & Overnight oats", "Insalate di cereali"]
   - For "Proteine Vegetali & Secondi": ["Secondi a base di Tofu", "Tempeh", "Seitan", "Soia", "Farinate & Frittate", "Polpette & Burger vegetali", "Piatti a base di legumi", "Insalate di legumi"]
   - For "Panificati e Piatti Unici": ["Piadine & Wraps", "Panini & Bruschette", "Pizze & Focacce", "Torte salate"]
   - For "Verdure e Contorni": ["Verdure al forno", "Verdure in padella", "Verdure bollite & a vapore", "Zuppe & Vellutate", "Contorni"]
   - For "Dolci, Colazioni e Snack": ["Biscotti", "Energy balls & Barrette", "Frullati", "Frutta fresca & Macedonie", "Frutta secca", "Gelati", "Merende & Colazioni dolci/salate", "Torte da forno", "A base di latte/yogurt vegetale"]
5. "slot_consigliato": Exactly one of: "colazione", "spuntino", "pranzo_cena".
6. "gruppi_alimentari": Array containing one or more from: ["cereali", "verdura", "frutta", "frutta_secca_semi", "cibi_proteici", "grassi"].
7. "difficolta": Exactly one of: "Facile", "Media", "Difficile".
6. "porzioni": Integer number of servings (e.g. 4, 2).
7. "porzioni_testo": String description in Italian (e.g. "4 porzioni", "2 porzioni").
8. "tempi": Object with:
   - "tempo_totale_minuti": Integer number (e.g. 30)
   - "tempo_preparazione": String in Italian (e.g. "10 minuti")
   - "tempo_cottura": String in Italian (e.g. "20 minuti")
   - "tempi_display": String formatted as "Prep: X min, Cottura: Y min"
9. "ingredienti": Array of ingredient strings in Italian. Every item MUST preserve its full quantity at the beginning (e.g. "200 g di tofu al naturale", "2 cucchiai di salsa di soia", "1 spicchio di aglio", "1/2 cucchiaino di sale"). NEVER omit or strip leading digits!
10. "ingredienti_per_sezione": Array of objects: [{ "sezione": "Principale", "ingredienti": ["..."] }]. If the recipe specifies distinct sections (e.g. "Impasto", "Condimento", "Salsa"), split them into respective sections.
11. "ingredienti_dettagliati": Array of structured ingredient objects:
    [{
      "sezione": "Principale",
      "testo": "200 g di tofu al naturale",
      "quantita": 200,
      "unita": "g",
      "ingrediente": "tofu al naturale"
    }]
12. "istruzioni": Array of strings, where each element is an orderly, concise cooking step in Italian.
13. "suggerimenti": Array of strings with 1-2 helpful chef tips (e.g. storage advice, serving suggestions, or culinary tricks).
14. "tags": Array of strings (e.g. ["100% Vegetale", "Senza Glutine", "Primi piatti"]).
15. "immagine": Direct URL string of the main recipe photo (extract the full image URL from markdown image tags like ![...](https://...), picking the photo of the dish and ignoring site logos, social icons, or author profile avatars). If not available, return "".

Respond ONLY with the JSON object, without any additional markdown explanation or surrounding commentary.
`;

export interface RecipeImageInput {
  base64: string;
  mimeType?: string;
  uri?: string;
}

export interface ParseRecipeInput {
  text?: string;
  url?: string;
  imageBase64?: string;
  imageMimeType?: string;
  images?: RecipeImageInput[];
}

export async function parseRecipeWithAI(input: ParseRecipeInput): Promise<Recipe> {
  const config = getAIConfig();
  
  if (!config.apiKey && config.provider !== 'custom') {
    throw new Error(`Chiave API mancante per ${config.provider.toUpperCase()}. Configura EXPO_PUBLIC_GEMINI_API_KEY nel file .env.`);
  }

  const effectiveInput: ParseRecipeInput = { ...input };
  const targetUrl = input.url || (input.text && /^https?:\/\/[^\s]+$/i.test(input.text.trim()) ? input.text.trim() : null);

  if (targetUrl) {
    try {
      const jinaRes = await fetchWithTimeout(`https://r.jina.ai/${targetUrl}`, {
        headers: { 'Accept': 'text/plain' }
      }, 12000);
      if (jinaRes.ok) {
        const markdown = await jinaRes.text();
        if (markdown && markdown.length > 50) {
          effectiveInput.text = `Recipe Source URL: ${targetUrl}\n\nWebpage Content:\n${markdown}`;
        }
      }
    } catch {
      // Gracefully fall back to passing the raw URL if reader times out or fails
    }
  }

  switch (config.provider) {
    case 'gemini':
      return parseWithGemini(effectiveInput, config);
    case 'openai':
    case 'openrouter':
    case 'custom':
      return parseWithOpenAICompatible(effectiveInput, config);
    case 'claude':
      return parseWithClaude(effectiveInput, config);
    default:
      return parseWithGemini(effectiveInput, config);
  }
}

// Alias for backwards compatibility
export const parseRecipeWithGemini = parseRecipeWithAI;

async function parseWithGemini(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  const candidateModels = [
    config.model || 'gemini-3.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest'
  ];

  const contentsParts: any[] = [
    { text: RECIPE_PROMPT_SYSTEM }
  ];

  const allImages: RecipeImageInput[] = input.images && input.images.length > 0
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
        text: 'Extract and structure the complete plant-based recipe from the attached image (cookbook page, screenshot, handwritten note).'
      });
    } else {
      contentsParts.push({
        text: `These ${allImages.length} images are consecutive pages/photos of the SAME recipe from a cookbook or notebook (for example, page 1 might contain the title and ingredients, while page 2 contains directions, notes, or variations). Analyze, merge, and unite all information from all ${allImages.length} images into a single cohesive, high-quality, complete plant-based recipe.`
      });
    }
  }

  if (input.url) {
    contentsParts.push({
      text: `Extract and structure the plant-based recipe from this URL: ${input.url}`
    });
  }

  if (input.text) {
    contentsParts.push({
      text: `Extract and structure the recipe from this text:\n\n${input.text}`
    });
  }

  const payload = {
    contents: [{ parts: contentsParts }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json'
    }
  };

  let lastErrorMsg = '';

  for (const model of candidateModels) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
      const response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }, 45000);

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.error && errJson.error.message) {
            lastErrorMsg = errJson.error.message;
          }
        } catch {}
        continue;
      }

      const data = await response.json();
      const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawContent) {
        return normalizeParsedRecipe(rawContent, input.url);
      }
    } catch (e: any) {
      lastErrorMsg = e.message;
    }
  }

  throw new Error(lastErrorMsg || 'Impossibile estrarre la ricetta con Gemini. Riprova tra poco.');
}

async function parseWithOpenAICompatible(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  let baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  let defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.apiKey}`
  };

  if (config.provider === 'openrouter') {
    defaultHeaders['HTTP-Referer'] = 'https://greenwhisker.app';
    defaultHeaders['X-Title'] = 'Green Whisker';
  }

  const userContentParts: any[] = [];

  if (input.text) {
    userContentParts.push({
      type: 'text',
      text: `Extract and structure the recipe from this raw text:\n\n${input.text}`
    });
  }

  if (input.url) {
    userContentParts.push({
      type: 'text',
      text: `Extract and structure the plant-based recipe from this URL:\n\n${input.url}`
    });
  }

  const allImages: RecipeImageInput[] = input.images && input.images.length > 0
    ? input.images
    : input.imageBase64
      ? [{ base64: input.imageBase64, mimeType: input.imageMimeType || 'image/jpeg' }]
      : [];

  if (allImages.length > 0) {
    allImages.forEach(img => {
      const mime = img.mimeType || 'image/jpeg';
      userContentParts.push({
        type: 'image_url',
        image_url: {
          url: `data:${mime};base64,${img.base64}`
        }
      });
    });
    if (allImages.length === 1) {
      userContentParts.push({
        type: 'text',
        text: 'Extract the recipe from this image.'
      });
    } else {
      userContentParts.push({
        type: 'text',
        text: `These ${allImages.length} images are consecutive pages of the SAME recipe from a cookbook. Combine all ingredients, quantities, and steps from all pages into a single complete recipe.`
      });
    }
  }

  const payload = {
    model: config.model || (config.provider === 'openrouter' ? 'deepseek/deepseek-chat' : 'gpt-4o-mini'),
    messages: [
      { role: 'system', content: RECIPE_PROMPT_SYSTEM },
      { role: 'user', content: userContentParts.length === 1 && userContentParts[0].type === 'text' ? userContentParts[0].text : userContentParts }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };

  const response = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: defaultHeaders,
    body: JSON.stringify(payload)
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Errore API (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error && errJson.error.message) {
        errorMsg = errJson.error.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;

  if (!rawContent) {
    throw new Error('Nessuna risposta ricevuta dal modello.');
  }

  return normalizeParsedRecipe(rawContent, input.url);
}

async function parseWithClaude(input: ParseRecipeInput, config: AIConfig): Promise<Recipe> {
  const endpoint = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01'
  };

  const userContent: any[] = [];

  const allImages: RecipeImageInput[] = input.images && input.images.length > 0
    ? input.images
    : input.imageBase64
      ? [{ base64: input.imageBase64, mimeType: input.imageMimeType || 'image/jpeg' }]
      : [];

  if (allImages.length > 0) {
    allImages.forEach(img => {
      userContent.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mimeType || 'image/jpeg',
          data: img.base64
        }
      });
    });
  }

  let textPrompt = '';
  if (input.text) textPrompt += `Extract and structure the recipe from this text:\n\n${input.text}\n\n`;
  if (input.url) textPrompt += `Extract and structure the recipe from this URL: ${input.url}\n\n`;
  textPrompt += 'Output ONLY the raw JSON object adhering to the schema.';

  userContent.push({ type: 'text', text: textPrompt });

  const payload = {
    model: config.model || 'claude-3-5-sonnet-20241022',
    max_tokens: 2500,
    system: RECIPE_PROMPT_SYSTEM,
    messages: [
      { role: 'user', content: userContent }
    ]
  };

  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  }, 45000);

  if (!response.ok) {
    const errorText = await response.text();
    let errorMsg = `Errore Claude (${response.status})`;
    try {
      const errJson = JSON.parse(errorText);
      if (errJson.error && errJson.error.message) {
        errorMsg = errJson.error.message;
      }
    } catch {}
    throw new Error(errorMsg);
  }

  const data = await response.json();
  const rawContent = data?.content?.[0]?.text;

  if (!rawContent) {
    throw new Error('Nessuna risposta ricevuta da Claude.');
  }

  return normalizeParsedRecipe(rawContent, input.url);
}

function normalizeParsedRecipe(rawContent: string, sourceUrl?: string): Recipe {
  let parsed: any;
  try {
    const cleaned = rawContent.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error('Impossibile interpretare la risposta JSON generata dal modello.');
  }

  const safeId = 'custom-' + (parsed.titolo || 'ricetta')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    + '-' + Math.random().toString(36).substring(2, 6);

  const category = VALID_CATEGORIES.includes(parsed.categoria) ? parsed.categoria : 'Primi e Cereali';
  const macroCategory = parsed.macro_categoria || category;
  const subCategory = parsed.sottocategoria || '';
  const slot: SlotConsigliato = VALID_SLOTS.includes(parsed.slot_consigliato) ? parsed.slot_consigliato : 'pranzo_cena';
  const porzioni = typeof parsed.porzioni === 'number' && parsed.porzioni > 0 ? parsed.porzioni : 4;
  const tempoTot = parsed.tempi?.tempo_totale_minuti || 30;

  const recipe: Recipe = {
    id: safeId,
    titolo: parsed.titolo || 'Nuova Ricetta',
    fonte: 'Personalizzata (AI)',
    url: sourceUrl || parsed.url || '',
    immagine: (parsed.immagine && typeof parsed.immagine === 'string' && parsed.immagine.trim() && parsed.immagine !== 'null') ? parsed.immagine.trim() : '',
    categoria: category,
    macro_categoria: macroCategory,
    sottocategoria: subCategory,
    difficolta: parsed.difficolta === 'Difficile' ? 'Difficile' : parsed.difficolta === 'Media' ? 'Media' : 'Facile',
    porzioni: porzioni,
    porzioni_testo: parsed.porzioni_testo || `${porzioni} porzioni`,
    tempi: {
      tempo_totale_minuti: tempoTot,
      tempo_preparazione: parsed.tempi?.tempo_preparazione || `${Math.round(tempoTot * 0.4)} minuti`,
      tempo_cottura: parsed.tempi?.tempo_cottura || `${Math.round(tempoTot * 0.6)} minuti`,
      tempi_display: parsed.tempi?.tempi_display || `Prep: ${Math.round(tempoTot * 0.4)} min, Cottura: ${Math.round(tempoTot * 0.6)} min`
    },
    ingredienti: Array.isArray(parsed.ingredienti) ? parsed.ingredienti : [],
    ingredienti_per_sezione: Array.isArray(parsed.ingredienti_per_sezione) && parsed.ingredienti_per_sezione.length > 0
      ? parsed.ingredienti_per_sezione
      : [{ sezione: 'Principale', ingredienti: Array.isArray(parsed.ingredienti) ? parsed.ingredienti : [] }],
    ingredienti_dettagliati: Array.isArray(parsed.ingredienti_dettagliati) && parsed.ingredienti_dettagliati.length > 0
      ? parsed.ingredienti_dettagliati
      : (Array.isArray(parsed.ingredienti) ? parsed.ingredienti : []).map((t: string) => ({
          sezione: 'Principale',
          testo: t,
          quantita: null,
          unita: '',
          ingrediente: t
        })),
    istruzioni: Array.isArray(parsed.istruzioni) ? parsed.istruzioni : [],
    suggerimenti: Array.isArray(parsed.suggerimenti) ? parsed.suggerimenti : [],
    tags: Array.isArray(parsed.tags) && parsed.tags.length > 0 ? parsed.tags : ['100% Vegetale', category],
    slot_consigliato: slot,
    gruppi_alimentari: Array.isArray(parsed.gruppi_alimentari) ? parsed.gruppi_alimentari : ['verdura', 'cibi_proteici']
  };

  return recipe;
}
