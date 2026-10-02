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

  // 1. BEVANDE VEGETALI, CAFFÈ, TÈ E BEVANDE
  if (
    /\b(latte\s+di\s+soia|latte\s+d\s*avena|latte\s+di\s+mandorl\w*|latte\s+di\s+riso|latte\s+di\s+cocco|latte\s+di\s+nocciol\w*|latte\s+di\s+canapa|latte\s+di\s+anacard\w*|latte\s+vegetale|bevanda\s+vegetale|bevanda\s+di\s+soia|bevanda\s+d\s*avena|bevanda\s+di\s+mandorl\w*|bevanda\s+di\s+riso|bevanda\s+di\s+cocco|succo\s+di\s+frutta|succo\s+d\s*arancia|succo|spremuta|caffe|caffe\s+solubile|caffe\s+in\s+grani|te\b|the\b|tisana|tisane|infuso|infusi|camomilla|orzo\s+solubile|orzo\s+bimbo|bevanda\s+d\s*orzo|birra|birre|vino|vino\s+bianco|vino\s+rosso|sidro|kombucha)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_BEVANDE_VEGETALI';
  }

  // 2. DOLCIFICANTI
  if (
    /\b(zucchero|zucchero\s+di\s+canna|zucchero\s+a\s+velo|zucchero\s+muscovado|sciroppo\s+d\s*acero|sciroppo\s+d\s*agave|agave|malto\s+d\s*orzo|malto\s+di\s+riso|sciroppo\s+di\s+riso|melassa|stevia|eritritolo|xilitolo|dolcificante)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_DOLCIFICANTI';
  }

  // 3. FARINE (amidi, fecola, lievito dolci - deve precedere Legumi/Cereali es. "farina di ceci", "farina d'avena")
  if (
    /\b(farina|amido\s+di\s+mais|maizena|fecola\s+di\s+patate|fecola|amido\s+di\s+riso|tapioca|cremor\s+tartaro|lievito\s+per\s+dolci|lievito\s+vanigliato|lievito\s+istantaneo|bicarbonato)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_FARINE';
  }

  // 4. BANCO FRIGO (tofu, tempeh, yogurt veg, formaggi veg artigianali e commerciali, pasta sfoglia/brisée)
  if (
    /\b(tofu|tempeh|seitan|yogurt|formaggio\s+veg\w*|mozzarella\s+veg\w*|stracchino\s+veg\w*|ricotta\s+veg\w*|caciotta\s+veg\w*|gondino|anacardino|fermentino|spalmabile\s+veg\w*|parmigiano\s+veg\w*|grana\s+veg\w*|feta\s+veg\w*|burro\s+vegetale|burro\s+di\s+soia|margarina|panna\s+vegetale|panna\s+di\s+soia|panna\s+d\s*avena|panna\s+di\s+riso|pasta\s+sfoglia|pasta\s+brisee|pasta\s+frolla|pasta\s+fillo|pasta\s+kataifi|pasta\s+pizza|pasta\s+per\s+pizza|lievito\s+di\s+birra\s+fresco|lievito\s+fresco|hummus|hummus\s+pronto|affettat\w*\s+veg\w*|salumi\s+veg\w*|wurstel\s+veg\w*|burger\s+veg\w*|cotoletta\s+veg\w*)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_BANCO_FRIGO';
  }

  // 5. CONSERVE (pomodori pelati, passata, olive, sottoli)
  if (
    /\b(passata|pelati|polpa\s+di\s+pomodoro|pomodor\w*\s+in\s+scatola|concentrato\s+di\s+pomodoro|doppio\s+concentrato|triplo\s+concentrato|pomodor\w*\s+secch\w*|olive|oliva|capperi|cappero|sottolio|sottaceti|carciofini\s+sott|giardiniera|funghi\s+secchi|marmellata|confettura|composta\s+di\s+frutta)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_CONSERVE';
  }

  // 6. CONDIMENTI (oli, aceti, pesti, brodi, salsa soia, tahina, senape)
  if (
    /\b(olio|olio\s+evo|olio\s+extravergine|aceto|aceto\s+balsamico|aceto\s+di\s+mele|aceto\s+di\s+vino|salsa\s+di\s+soia|tamari|shoyu|miso|tahina|tahini|senape|maionese\s+veg\w*|maionese|ketchup|gomasio|acidulato|lievito\s+alimentare|pesto|pesto\s+alla\s+genovese|pesto\s+vegetale|pesto\s+veg\w*|pesto\s+rosso|brodo\s+vegetale|brodo|dado\s+vegetale|dado|glassa\s+balsamica|glassa\s+di\s+aceto)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_CONDIMENTI';
  }

  // Acqua di cottura non deve finire sotto Pasta
  if (/\bacqua\s+di\s+cottura\b/.test(raw)) {
    return 'CAT_SHOPPING_VARIE';
  }

  // 7. PASTA E CEREALI (pasta secca, riso, farro, orzo, quinoa, fiocchi d'avena, polenta)
  if (
    /\b(pasta|spaghetti|spaghettoni|linguine|bucatini|penne|pennette|rigatoni|mezze\s+maniche|fusilli|farfalle|orecchiette|tagliatelle|tagliolini|pappardelle|lasagne|lasagna|gnocchi|chicche|noodles|udon|soba|ramen|vermicelli|cannelloni|tortiglioni|calamarata|paccheri|riso|riso\s+basmati|riso\s+carnaroli|riso\s+arborio|riso\s+integrale|riso\s+rosso|riso\s+nero|riso\s+venere|farro|orzo\s+perlato|orzo\s+decorticato|orzo|quinoa|grano\s+saraceno|miglio|couscous|cous\s+cous|cuscus|bulgur|amaranto|polenta|semolino|fiocchi\s+d\s*avena|fiocchi\s+di\s+avena|fiocchi\s+di\s+farro|fiocchi\s+di\s+soia|muesli|musli|granola|corn\s*flakes|porridge|riso\s+soffiato|cereali\s+soffiati)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_PASTA_E_CEREALI';
  }

  // 8. PANE E PRODOTTI DA FORNO
  if (
    /\b(pane|pagnotta|filone|ciabatta|pan\s+bauletto|pancarre|fette\s+biscottate|piadina|piadine|tortilla|tortillas|wrap|pita|friselle|cracker|crackers|gallette|grissini|taralli|tarallini|pangrattato|pan\s+grattato|crostini|crostino|focaccia|bruschetta|crostini\s+dorati|biscotti|biscotto|frollini)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_PANE_E_PRODOTTI_DA_FORNO';
  }

  // 9. LEGUMI (ceci, lenticchie, fagioli, piselli, soia, ecc.)
  if (
    /\b(ceci|cece|lenticchie|lenticchia|fagioli|fagiolo|fagiolini|piselli|pisello|fave|fava|edamame|lupini|lupino|cicerchie|cicerchia|soia\s+gialla|bocconcini\s+di\s+soia|spezzatino\s+di\s+soia|granulare\s+di\s+soia|fagioli\s+borlotti|fagioli\s+cannellini|fagioli\s+neri|fagioli\s+rossi|azuki)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_LEGUMI';
  }

  // 10. FRUTTA SECCA E SEMI OLEOSI (inclusi cocco in scaglie, semi e burri di frutta secca)
  if (
    /\b(mandorl\w*|noc\w*|nocciol\w*|anacardi|anacardio|pistacch\w*|arachid\w*|pinoli|pinolo|semi\s+di\s+sesamo|semi\s+di\s+lino|semi\s+di\s+chia|semi\s+di\s+zucca|semi\s+di\s+girasole|semi\s+di\s+canapa|semi\s+di\s+papavero|semi\s+oleosi|uvetta|uva\s+passa|datteri|dattero|prugne\s+secche|albicocche\s+secche|fichi\s+secchi|burro\s+d\s*arachidi|burro\s+di\s+mandorl\w*|crema\s+100%|cocco\s+in\s+scaglie|scaglie\s+di\s+cocco|cocco\s+rape|farina\s+di\s+cocco|cocco\s+grattugiato|noci\s+del\s+brasile|noci\s+pecan|macadamia)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_FRUTTA_SECCA_E_SEMI_OLEOSI';
  }

  // 11. SPEZIE ED ERBE AROMATICHE
  if (
    /\b(sale|sale\s+fino|sale\s+grosso|sale\s+marino|sale\s+rosa|pepe|pepe\s+nero|pepe\s+bianco|rosmarino|origano|basilico|timo|salvia|alloro|prezzemolo|maggiorana|menta|aneto|erba\s+cipollina|coriandolo|dragoncello|curcuma|curry|paprika|paprica|peperoncino|cannella|cumino|noce\s+moscata|chiodi\s+di\s+garofano|cardamomo|zafferano|semi\s+di\s+finocchio|finocchietto|bacche\s+di\s+ginepro|vaniglia|vanillina)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_SPEZIE_ED_ERBE_AROMATICHE';
  }

  // 12. VERDURA E FRUTTA FRESCA (tutta la verdura e frutta fresca)
  if (
    /\b(aglio|cipolla|cipolle|cipollotto|cipollotti|scalogno|porro|porri|pomodoro|pomodori|pomodorini|datterini|ciliegini|piccadilly|costoluto|san\s+marzano|zucchina|zucchine|melanzana|melanzane|carota|carote|patata|patate|patata\s+dolce|patate\s+dolci|batata|batate|zucca|peperone|peperoni|friggitelli|friggitello|spinaci|bietola|bietole|coste|erbette|cavolo|cavolfiore|broccoli|broccolo|broccoletti|cima\s+di\s+rapa|cime\s+di\s+rapa|verza|cavolo\s+cappuccio|cavolo\s+nero|cavolo\s+riccio|kale|pak\s*choi|cavolini\s+di\s+bruxelles|funghi|fungo|champignon|porcini|pleurotus|chiodini|insalata|lattuga|rucola|radicchio|scarola|songino|valeriana|misticanza|lattughino|indivia|cicoria|catalogna|puntarell\w*|agretti|barba\s+di\s+frate|taccole|taccola|finocchio|finocchi|sedano|sedano\s+rapa|topinambur|asparagi|asparago|carciofi|carciofo|cetriolo|cetrioli|ravanelli|ravanello|barbabietola|barbabietole|avocado|limone|limoni|lime|arancia|arance|pompelmo|pompelmi|mandarini|mandarino|clementine|clementina|zenzero|mela|mele|pera|pere|banana|banane|fragol\w*|mirtill\w*|lampon\w*|fich\w*|pesch\w*|pescanoce|nettarin\w*|albicocc\w*|prugn\w*|susin\w*|uva|anguria|cocomero|melon\w*|kiwi|ananas|mango|papaya|cachi|kaki|melagran\w*|melogran\w*|mor\w*|ribes|ciliegi\w*|frutti\s+di\s+bosco)\b/.test(raw)
  ) {
    return 'CAT_SHOPPING_VERDURA';
  }

  // 13. VARIE (cioccolato, cacao, o altro non catalogato)
  return 'CAT_SHOPPING_VARIE';
}
