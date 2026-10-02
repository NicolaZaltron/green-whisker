import { SHOPPING_DEPARTMENTS, ShoppingDepartment } from '../constants/shoppingDepartments';

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Classifica un ingrediente in uno dei 14 reparti canonici del supermercato per la spesa.
 */
export function classifyShoppingDepartment(nameOrText: string, currentCategory?: string): ShoppingDepartment {
  // Se la categoria attuale è già uno dei 14 reparti canonici, mantienila
  if (currentCategory && (SHOPPING_DEPARTMENTS as readonly string[]).includes(currentCategory)) {
    return currentCategory as ShoppingDepartment;
  }

  const raw = normalizeText(nameOrText || '');
  if (!raw) return 'CAT_SHOPPING_VARIE';

  // 1. BEVANDE VEGETALI (da verificare prima di altri latti o cereali)
  if (
    /\b(latte\s+di\s+soia|latte\s+d\s*avena|latte\s+di\s+mandorl|latte\s+di\s+riso|latte\s+di\s+cocco|latte\s+di\s+nocciol|latte\s+vegetale|bevanda\s+vegetale|bevanda\s+di\s+soia|bevanda\s+d\s*avena|bevanda\s+di\s+mandorl|bevanda\s+di\s+riso|succo\s+di\s+frutta|succo\s+d\s*arancia)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_BEVANDE_VEGETALI';
  }

  // 2. DOLCIFICANTI
  if (
    /\b(zucchero|sciroppo\s+d\s*acero|sciroppo\s+d\s*agave|agave|malto\s+d\s*orzo|malto\s+di\s+riso|sciroppo\s+di\s+riso|melassa|stevia|eritritolo|xilitolo)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_DOLCIFICANTI';
  }

  // 3. FARINE (amidi, fecola, lievito dolci - deve precedere Legumi/Cereali es. "farina di ceci", "farina d'avena")
  if (
    /\b(farina|amido\s+di\s+mais|maizena|fecola|amido\s+di\s+riso|tapioca|cremor\s+tartaro|lievito\s+per\s+dolci|lievito\s+vanigliato|lievito\s+istantaneo|bicarbonato)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_FARINE';
  }

  // 4. BANCO FRIGO (tofu, tempeh, yogurt veg, formaggi veg, pasta sfoglia/brisée/fillo)
  if (
    /\b(tofu|tempeh|seitan|yogurt|formaggio\s+veg|mozzarella\s+veg|burro\s+vegetale|burro\s+di\s+soia|margarina|panna\s+vegetale|panna\s+di\s+soia|pasta\s+sfoglia|pasta\s+brisee|pasta\s+frolla|pasta\s+fillo|pasta\s+kataifi|pasta\s+pizza|pasta\s+per\s+pizza|lievito\s+di\s+birra\s+fresco|hummus\s+pronto|affettat\w*\s+veg)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_BANCO_FRIGO';
  }

  // 5. CONSERVE (pomodori pelati, passata, olive, sottoli)
  if (
    /\b(passata|pelati|polpa\s+di\s+pomodoro|concentrato\s+di\s+pomodoro|pomodor\w*\s+secch\w*|olive|oliva|capperi|cappero|sottolio|sottaceti|carciofini\s+sott|funghi\s+secchi|marmellata|confettura)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_CONSERVE';
  }

  // 6. CONDIMENTI (oli, aceti, salsa soia, tahina, senape)
  if (
    /\b(olio|olio\s+evo|aceto|salsa\s+di\s+soia|tamari|shoyu|miso|tahina|tahini|senape|maionese|ketchup|gomasio|acidulato|lievito\s+alimentare)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_CONDIMENTI';
  }

  // Acqua di cottura non deve finire sotto Pasta
  if (/\bacqua\s+di\s+cottura\b/.test(raw)) {
    return 'CAT_SHOPPING_VARIE';
  }

  // 7. PASTA E CEREALI (pasta secca, riso, farro, orzo, quinoa, fiocchi d'avena, polenta)
  if (
    /\b(pasta|spaghetti|spaghettoni|linguine|bucatini|penne|pennette|rigatoni|mezze\s+maniche|fusilli|farfalle|orecchiette|tagliatelle|tagliolini|pappardelle|lasagne|lasagna|gnocchi|chicche|noodles|udon|soba|ramen|vermicelli|riso|farro|orzo|quinoa|grano\s+saraceno|miglio|couscous|cous\s+cous|cuscus|bulgur|amaranto|polenta|semolino|fiocchi\s+d\s*avena|fiocchi\s+di\s+avena|fiocchi\s+di\s+farro|fiocchi\s+di\s+soia|muesli|musli|granola|corn\s*flakes|porridge|riso\s+soffiato|cereali\s+soffiati|crusca)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_PASTA_E_CEREALI';
  }

  // 8. PANE E PRODOTTI DA FORNO
  if (
    /\b(pane|pagnotta|pan\s+bauletto|pancarre|fette\s+biscottate|piadina|piadine|tortilla|tortillas|wrap|pita|friselle|cracker|crackers|gallette|grissini|taralli|pangrattato|pan\s+grattato|crostini|crostino|focaccia|bruschetta)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO';
  }

  // 10. LEGUMI (ceci, lenticchie, fagioli, piselli, soia, ecc.)
  if (
    /\b(ceci|cece|lenticchie|lenticchia|fagioli|fagiolo|fagiolini|piselli|pisello|fave|fava|edamame|lupini|lupino|cicerchie|cicerchia|soia\s+gialla|bocconcini\s+di\s+soia|spezzatino\s+di\s+soia|granulare\s+di\s+soia)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_LEGUMI';
  }

  // 11. FRUTTA SECCA E SEMI OLEOSI
  if (
    /\b(mandorl\w*|noc\w*|nocciol\w*|anacardi|anacardio|pistacch\w*|arachid\w*|pinoli|pinolo|semi\s+di\s+sesamo|semi\s+di\s+lino|semi\s+di\s+chia|semi\s+di\s+zucca|semi\s+di\s+girasole|semi\s+di\s+canapa|semi\s+di\s+papavero|semi\s+oleosi|uvetta|uva\s+passa|datteri|dattero|prugne\s+secche|albicocche\s+secche|fichi\s+secchi|burro\s+d\s*arachidi|burro\s+di\s+mandorl\w*|crema\s+100%)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI';
  }

  // 12. SPEZIE ED ERBE AROMATICHE
  if (
    /\b(sale|pepe|rosmarino|origano|basilico|timo|salvia|alloro|prezzemolo|maggiorana|menta|aneto|erba\s+cipollina|coriandolo|dragoncello|curcuma|curry|paprika|peperoncino|cannella|cumino|noce\s+moscata|chiodi\s+di\s+garofano|cardamomo|zafferano|semi\s+di\s+finocchio|finocchietto|bacche\s+di\s+ginepro|vaniglia|vanillina)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE';
  }

  // 13. VERDURA (e frutta fresca comune)
  if (
    /\b(aglio|cipolla|cipolle|cipollotto|scalogno|porro|porri|pomodoro|pomodori|pomodorini|datterini|ciliegini|zucchina|zucchine|melanzana|melanzane|carota|carote|patata|patate|patata\s+dolce|batata|zucca|peperone|peperoni|spinaci|bietola|bietole|erbette|cavolo|cavolfiore|broccoli|broccolo|broccoletti|cime\s+di\s+rapa|verza|funghi|fungo|champignon|porcini|insalata|lattuga|rucola|radicchio|scarola|songino|valeriana|finocchio|finocchi|sedano|asparagi|carciofi|carciofo|cetriolo|cetrioli|ravanelli|ravanello|barbabietola|avocado|limone|limoni|lime|arancia|arance|zenzero|mela|mele|pera|pere|banana|banane|fragol\w*|mirtill\w*|frutti\s+di\s+bosco)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_VERDURA';
  }

  // 14. VARIE (cioccolato, cacao, caffè, tè, acqua, o altro non catalogato)
  return 'CAT_SHOPPING_VARIE';
}
