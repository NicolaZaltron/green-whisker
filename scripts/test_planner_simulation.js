const ricette = require('../assets/ricette.json');

const BREAKFAST_CATEGORIES = new Set([
  'CAT_PORRIDGE_E_OVERNIGHT_OATS',
  'CAT_A_BASE_DI_YOGURT_VEGETALE',
  'CAT_BISCOTTI',
  'CAT_MERENDE_E_COLAZIONI_DOLCI',
  'CAT_FRULLATI',
  'CAT_TORTE_E_ALTRI_DOLCI_DA_FORNO',
  'CAT_A_BASE_DI_LATTE_VEGETALE',
]);

const SNACK_CATEGORIES = new Set([
  'CAT_ENERGY_BALLS_E_BARRETTE',
  'CAT_FRUTTA_FRESCA_E_MACEDONIE',
  'CAT_FRUTTA_SECCA',
  'CAT_GELATI',
]);

const PIATTO_UNICO_CATEGORIES = new Set([
  'CAT_BOWL',
  'CAT_INSALATE_DI_CEREALI',
  'CAT_INSALATE_DI_LEGUMI',
  'CAT_PASTA_AL_FORNO',
  'CAT_PIADINE_E_WRAPS',
  'CAT_TORTE_SALATE',
  'CAT_PIZZE_E_FOCACCIE',
  'CAT_PANINI_E_BRUSCHETTE',
]);

const PRIMI_CATEGORIES = new Set([
  'CAT_PRIMI_PIATTI',
  'CAT_RISOTTI',
  'CAT_GNOCCHI',
  'CAT_POLENTA',
  'CAT_ZUPPE_E_VELLUTATE',
]);

const SECONDI_CATEGORIES = new Set([
  'CAT_SECONDI_PIATTI',
  'CAT_PIATTI_A_BASE_DI_LEGUMI',
  'CAT_SECONDI_A_BASE_DI_TOFU',
  'CAT_SECONDI_A_BASE_DI_TEMPEH',
  'CAT_SECONDI_A_BASE_DI_SEITAN',
  'CAT_SECONDI_A_BASE_DI_SOIA',
  'CAT_FARINATE_E_FRITTATE',
  'CAT_POLPETTE_E_BURGER',
  'CAT_COTOLETTE',
]);

const CONTORNI_CATEGORIES = new Set([
  'CAT_CONTORNI',
  'CAT_VERDURE_AL_FORNO',
  'CAT_VERDURE_IN_PADELLA',
  'CAT_VERDURE_BOLLITE_E_A_VAPORE',
]);

// Protein groups mapping for anti-repetition
function getProteinGroup(cat) {
  if (['CAT_SECONDI_A_BASE_DI_TOFU', 'CAT_SECONDI_A_BASE_DI_TEMPEH', 'CAT_SECONDI_A_BASE_DI_SEITAN', 'CAT_SECONDI_A_BASE_DI_SOIA'].includes(cat)) {
    return 'soia_derivati';
  }
  if (['CAT_PIATTI_A_BASE_DI_LEGUMI', 'CAT_INSALATE_DI_LEGUMI'].includes(cat)) {
    return 'legumi';
  }
  if (['CAT_FARINATE_E_FRITTATE', 'CAT_POLPETTE_E_BURGER', 'CAT_COTOLETTE'].includes(cat)) {
    return 'alternative_veg';
  }
  return 'altro';
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const breakfastPool   = ricette.filter(r => BREAKFAST_CATEGORIES.has(r.category));
const snackPool       = ricette.filter(r => SNACK_CATEGORIES.has(r.category));
const piattoUnicoPool = ricette.filter(r => PIATTO_UNICO_CATEGORIES.has(r.category));
const primiPool       = ricette.filter(r => PRIMI_CATEGORIES.has(r.category));
const secondiPool     = ricette.filter(r => SECONDI_CATEGORIES.has(r.category));
const sidePool        = ricette.filter(r => CONTORNI_CATEGORIES.has(r.category));

const days = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const usedRecipeIds = new Set();
const usedSideIds = new Set();
const recentCategories = [];
const recentProteinGroups = [];
let lastFormat = null;

const weekPlan = [];

for (const day of days) {
  const dayPlan = { day };

  // 1. Colazione
  const bfCand = breakfastPool.filter(r => !usedRecipeIds.has(r.id));
  const chosenBf = shuffle(bfCand)[0] || shuffle(breakfastPool)[0];
  usedRecipeIds.add(chosenBf.id);
  dayPlan.colazione = `${chosenBf.title} (${chosenBf.category})`;

  // 2. Spuntino Mattina
  const snk1Cand = snackPool.filter(r => !usedRecipeIds.has(r.id));
  const chosenSnk1 = shuffle(snk1Cand)[0] || shuffle(snackPool)[0];
  usedRecipeIds.add(chosenSnk1.id);
  dayPlan.spuntino_mattina = `${chosenSnk1.title} (${chosenSnk1.category})`;

  // 3. Pranzo e Cena
  for (const slot of ['pranzo', 'cena']) {
    const isLunch = slot === 'pranzo';
    const allowPiattoUnico = lastFormat !== 'piatto_unico' && (isLunch ? Math.random() < 0.40 : Math.random() < 0.25);
    
    let chosenFormat;
    let pool;
    if (allowPiattoUnico) {
      chosenFormat = 'piatto_unico';
      pool = piattoUnicoPool;
    } else {
      if (lastFormat === 'primo') {
        chosenFormat = 'secondo';
        pool = secondiPool;
      } else if (lastFormat === 'secondo') {
        chosenFormat = 'primo';
        pool = primiPool;
      } else {
        chosenFormat = isLunch ? 'primo' : 'secondo';
        pool = chosenFormat === 'primo' ? primiPool : secondiPool;
      }
    }

    const scored = pool.map(r => {
      let score = Math.random() * 10;
      if (usedRecipeIds.has(r.id)) score -= 200;

      // Anti-monotonia categorie (ultimi 6 pasti / 3 giorni)
      const catIdx = recentCategories.lastIndexOf(r.category);
      if (catIdx !== -1) {
        const recency = recentCategories.length - catIdx;
        if (recency === 1) score -= 80;
        else if (recency === 2) score -= 60;
        else if (recency === 3) score -= 40;
        else if (recency <= 6) score -= 20;
      }

      // Anti-monotonia proteica
      if (SECONDI_CATEGORIES.has(r.category)) {
        const pg = getProteinGroup(r.category);
        const lastPgIdx = recentProteinGroups.lastIndexOf(pg);
        if (lastPgIdx !== -1) {
          const recency = recentProteinGroups.length - lastPgIdx;
          if (recency === 1) score -= 70;
          else if (recency === 2) score -= 45;
        }
      }

      return { recipe: r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored[0].recipe;
    usedRecipeIds.add(chosen.id);
    recentCategories.push(chosen.category);
    if (recentCategories.length > 6) recentCategories.shift();

    if (SECONDI_CATEGORIES.has(chosen.category)) {
      recentProteinGroups.push(getProteinGroup(chosen.category));
      if (recentProteinGroups.length > 4) recentProteinGroups.shift();
    }
    lastFormat = chosenFormat;

    let sideText = '';
    if (chosenFormat !== 'piatto_unico') {
      const sideCand = sidePool.filter(s => !usedSideIds.has(s.id) && !usedRecipeIds.has(s.id));
      const chosenSide = shuffle(sideCand)[0] || shuffle(sidePool)[0];
      if (chosenSide) {
        usedSideIds.add(chosenSide.id);
        sideText = ` + [Contorno: ${chosenSide.title} (${chosenSide.category})]`;
      }
    }

    dayPlan[slot] = `[${chosenFormat.toUpperCase()}] ${chosen.title} (${chosen.category})${sideText}`;
  }

  // 4. Spuntino Pomeriggio
  const snk2Cand = snackPool.filter(r => !usedRecipeIds.has(r.id) && r.id !== chosenSnk1.id);
  const chosenSnk2 = shuffle(snk2Cand)[0] || shuffle(snackPool)[0];
  usedRecipeIds.add(chosenSnk2.id);
  dayPlan.spuntino_pomeriggio = `${chosenSnk2.title} (${chosenSnk2.category})`;

  weekPlan.push(dayPlan);
}

console.log(JSON.stringify(weekPlan, null, 2));
