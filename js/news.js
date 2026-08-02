const WORLD_TOPICS = [
    { key: 'diplomacy', ko: '외교', en: 'Diplomacy', keywords: ['summit', 'diplomacy', 'diplomat', 'diplomatic', 'bilateral', 'ambassador', 'foreign minister', 'foreign ministry', 'embassy', 'treaty', 'peace talks', 'negotiations', 'envoy', 'security council', 'state visit', 'foreign policy', 'consulate', 'diplomatic ties'] },
    // Bare "attack"/"strike" are deliberately NOT here — too ambiguous ("strikes a
    // deal" is business, a lone "attacker" is Crime, not a state-level War).
    { key: 'war', ko: '전쟁', en: 'War', keywords: ['war', 'military strike', 'airstrike', 'air strike', 'missile strike', 'drone strike', 'military', 'troops', 'invasion', 'missile', 'ceasefire', 'combat', 'offensive', 'shelling', 'insurgent', 'militant', 'rebel', 'clashes', 'gunfire', 'bombardment', 'front line', 'warzone', 'hostilities', 'armed forces', 'fighting', 'battlefield'] },
    { key: 'security', ko: '안보', en: 'Security', keywords: ['national security', 'nuclear weapon', 'defense ministry', 'military buildup', 'arms deal', 'weapons shipment', 'nato', 'intelligence agency', 'espionage', 'defense budget', 'army chief', 'military drill', 'spy network', 'classified documents', 'pentagon', 'wartime', 'security threat'] },
    { key: 'alliance', ko: '동맹', en: 'Alliance', keywords: ['alliance', 'coalition', 'joint military exercise', 'defense pact', 'mutual defense', 'allied forces', 'security pact', 'strategic partnership'] },
    { key: 'cybersecurity', ko: '보안', en: 'Cybersecurity', keywords: ['cyberattack', 'hacked', 'data breach', 'ransomware', 'cybersecurity', 'hacker', 'leaked data', 'phishing', 'cyber espionage', 'malware'] },
    { key: 'terrorism', ko: '테러', en: 'Terrorism', keywords: ['terrorist', 'terrorism', 'terror plot', 'extremist attack', 'suicide bombing', 'bomb plot', 'radicalized', 'jihadist', 'terror cell', 'terror group'] },
    { key: 'refugees', ko: '난민', en: 'Refugees', keywords: ['refugee', 'refugee camp', 'asylum seekers', 'displaced people', 'humanitarian crisis', 'refugee crisis', 'stateless', 'resettlement', 'fleeing war'] },
    { key: 'humanrights', ko: '인권', en: 'Human Rights', keywords: ['human rights', 'genocide', 'ethnic cleansing', 'war crimes', 'political prisoner', 'persecution', 'freedom of speech', 'censorship', 'detained journalist', 'activist arrested', 'forced labor', 'discrimination'] },
    { key: 'health', ko: '보건', en: 'Health', keywords: ['public health', 'hospital crisis', 'health crisis', 'mental health', 'healthcare system', 'medical shortage', 'doctor shortage', 'health policy', 'medical care'] },
    { key: 'infectiousdisease', ko: '전염병', en: 'Infectious Disease', keywords: ['outbreak', 'epidemic', 'pandemic', 'virus', 'infectious disease', 'superbug', 'contagion', 'quarantine', 'disease spread', 'vaccine', 'vaccination', 'vaccine rollout'] },
    { key: 'environment', ko: '환경', en: 'Environment', keywords: ['pollution', 'wildlife', 'deforestation', 'air quality', 'water level', 'endangered species', 'biodiversity', 'plastic waste', 'ocean warming', 'conservation', 'environmental damage'] },
    { key: 'climatechange', ko: '기후', en: 'Climate Change', keywords: ['climate change', 'global warming', 'climate summit', 'climate treaty', 'extreme weather', 'rising sea levels', 'climate crisis', 'greenhouse gas', 'cop28', 'cop29', 'cop30'] },
    { key: 'energy', ko: '에너지', en: 'Energy', keywords: ['power grid', 'blackout', 'energy crisis', 'gas pipeline', 'oil supply cut', 'solar panel', 'renewable energy', 'energy transition', 'power outage', 'electricity prices', 'fuel shortage'] },
    { key: 'nuclear', ko: '원자력', en: 'Nuclear Energy', keywords: ['nuclear plant', 'nuclear reactor', 'nuclear power', 'nuclear energy', 'atomic energy', 'nuclear fuel', 'nuclear meltdown'] },
    { key: 'space', ko: '우주', en: 'Space', keywords: ['nasa', 'rocket launch', 'satellite', 'spacex', 'space mission', 'space station', 'astronaut', 'moon mission', 'mars mission', 'space agency'] },
    { key: 'science', ko: '과학/기술', en: 'Science & Tech', keywords: ['scientists discover', 'research breakthrough', 'science study', 'scientific discovery', 'physics research', 'biology research', 'science journal'] },
    { key: 'education', ko: '교육', en: 'Education', keywords: ['school', 'university', 'students', 'tuition', 'curriculum', 'education policy', 'exam results', 'campus', 'professor', 'enrollment', 'classroom'] },
    // Note: strikes/wages/labor disputes are here, NOT under 고용(Employment) in the
    // econ list — the new definitions split them explicitly (고용 = unemployment
    // rate/hiring stats, 노동 = strikes/wage disputes/working conditions), so 고용's
    // keywords were narrowed to statistics-only to let disputes fall through to here.
    { key: 'labor', ko: '노동', en: 'Labor', keywords: ['labor union', "workers' rights", 'labor strike', 'union talks', 'wage dispute', 'workers protest', 'labor dispute', 'collective bargaining', 'workplace conditions', 'workplace safety', 'child labor', 'labor rights', 'strike action', 'union vote'] },
    { key: 'migration', ko: '이민', en: 'Migration', keywords: ['migrant', 'migration', 'border crossing', 'deportation', 'immigration policy', 'border wall', 'migrant crisis', 'illegal immigration'] },
    { key: 'publicsafety', ko: '치안', en: 'Public Safety', keywords: ['riot', 'unrest', 'protest', 'demonstration', 'clashes with police', 'curfew', 'tear gas', 'evacuation order', 'security lockdown'] },
    // Bare "court" and "lawsuit" are deliberately NOT here — most real headlines using
    // those words are civil/patent/political cases, not criminal ones. "trial" stays
    // since in news headlines it overwhelmingly means a criminal trial.
    { key: 'crime', ko: '범죄', en: 'Crime', keywords: ['murder', 'shooting', 'stabbing', 'knife attack', 'gunman', 'attacker', 'mass shooting', 'crime', 'criminal court', 'trial', 'convict', 'arrest', 'indict', 'sentence', 'gang violence', 'fraud scheme', 'kidnapping', 'robbery', 'homicide', 'manhunt', 'investigation into', 'charges filed', 'felony', 'guilty plea', 'prosecutors'] },
    { key: 'disaster', ko: '재난', en: 'Disaster', keywords: ['earthquake', 'flood', 'flooding', 'disaster', 'hurricane', 'wildfire', 'typhoon', 'tsunami', 'landslide', 'volcano', 'storm damage', 'cyclone', 'avalanche'] },
    { key: 'food', ko: '식량', en: 'Food Security', keywords: ['famine', 'food shortage', 'food crisis', 'crop failure', 'starvation', 'food insecurity', 'harvest failure', 'malnutrition'] },
    { key: 'logistics', ko: '물류', en: 'Logistics', keywords: ['freight disruption', 'supply route', 'logistics disruption', 'port congestion', 'trucking', 'cargo delay'] },
    { key: 'shipping', ko: '해운', en: 'Shipping', keywords: ['shipping route', 'port blockade', 'canal blocked', 'cargo ship', 'container ship', 'maritime', 'tanker', 'strait blockade'] },
    { key: 'aireg', ko: 'AI', en: 'AI', keywords: ['ai regulation', 'ai act', 'artificial intelligence law', 'ai safety rules', 'ai governance', 'tech regulation', 'data privacy law'] },
    // Redefined to match the updated spec: 미디어 is now the journalism/press/platform
    // industry specifically, not entertainment — streaming/box office/concerts moved to
    // 문화 below, which now explicitly covers film/music/festivals.
    { key: 'media', ko: '미디어', en: 'Media', keywords: ['press freedom', 'journalism', 'news outlet', 'news network', 'broadcaster', 'social media platform', 'sns platform', 'media regulation', 'newspaper', 'journalist', 'media company'] },
    { key: 'religion', ko: '종교', en: 'Religion', keywords: ['pope', 'vatican', 'religious leader', 'church', 'mosque', 'temple', 'religious freedom', 'faith leaders', 'interfaith', 'pilgrimage', 'archbishop', 'imam', 'rabbi'] },
    { key: 'sports', ko: '스포츠', en: 'Sports', keywords: ['olympic', 'world cup', 'championship', 'tournament', 'football match', 'basketball', 'soccer', 'grand slam', 'athlete', 'coach fired', 'medal', 'marathon', 'boxing match'] },
    // Culture and Politics go LAST on purpose: both lean on fairly generic vocabulary
    // ("government", "festival"-adjacent words) that shows up incidentally in plenty of
    // stories that really belong to a more specific category above — checking them last
    // means the more specific match wins whenever one exists.
    { key: 'culture', ko: '문화', en: 'Culture', keywords: ['museum', 'heritage', 'festival', 'art exhibit', 'film festival', 'painting', 'novel', 'exhibition', 'literature', 'theater', 'opera', 'monument', 'author', 'sculpture', 'streaming service', 'box office', 'coachella', 'concert', 'music festival', 'tv show', 'movie premiere', 'film studio', 'record label', 'publishing house', 'lifestyle'] },
    { key: 'politics', ko: '정치', en: 'Politics', keywords: ['election', 'president', 'parliament', 'government', 'minister', 'vote', 'congress', 'senate', 'prime minister', 'coup', 'impeachment', 'cabinet', 'political party', 'referendum', 'lawmaker', 'political crisis'] }
];
const DEFAULT_WORLD_TOPIC = WORLD_TOPICS.find(t => t.key === 'politics'); // generic fallback for hard-news items
// Weak corroborating signal used ONLY to decide whether an unmatched business-feed
// headline should fall back to Corporate rather than staying generic — see
// fetchFeedItems. Feed origin alone is not enough evidence on its own.
const BUSINESS_SIGNAL_HINTS = ['$', '%', 'million', 'billion', 'trillion', 'stock', 'market', 'shares', 'ceo', 'company', 'companies', 'earnings', 'revenue', 'profit', 'ipo', 'nasdaq', 'investor', 'quarter', 'percent', 'fiscal'];

// Phrases that use "war"/"battle" figuratively — never treated as an actual armed conflict.
// The commercial ones (price/bidding/turf/talent wars) route to Corporate instead of
// falling through to a generic tag, since they're really business competition stories.
const WAR_EXCLUDE_PHRASES = ['price war', 'bidding war', 'war of words', 'trade war', 'turf war', 'war chest', 'culture war', 'war on drugs', 'war on', 'price battle', 'talent war', 'streaming war'];
const WAR_EXCLUDE_TO_CORPORATE = ['price war', 'bidding war', 'turf war', 'talent war', 'price battle', 'streaming war'];

// Economic-news topic keywords, checked FIRST — if a story's core impact is on money,
// capital, companies, industry, investment, real estate, labor/wages, macro indicators
// (inflation/rates/FX), trade, or consumption, it is economic regardless of surface topic.
// Same strict-ordered-priority design as WORLD_TOPICS above. Note several pairs where a
// broader category is deliberately checked before a more specific one further down the
// user's specified order (무역→관세, 부동산→주택, 재정→세금, 공급망→물류배송,
// 가상화폐→블록체인, 모빌리티→자동차, ESG→탄소배출, 소비→유통, 투자→벤처→스타트업) —
// each earlier category's keywords deliberately exclude the later one's vocabulary so
// the later, more specific category actually gets a chance to match something.
const ECON_TOPICS = [
    { key: 'rates', ko: '금리', en: 'Interest Rates', keywords: ['interest rate', 'rate hike', 'rate cut', 'central bank', 'fed rate', 'policy rate', 'basis points', 'monetary policy', 'rate decision', 'benchmark rate', 'federal reserve'] },
    { key: 'inflation', ko: '물가', en: 'Inflation', keywords: ['inflation', 'consumer price', 'cpi ', 'cost of living', 'price rises', 'deflation', 'price surge', 'prices rise', 'hyperinflation', 'price pressures'] },
    { key: 'fx', ko: '환율', en: 'FX / Currency', keywords: ['exchange rate', 'currency', 'dollar strengthens', 'dollar weakens', 'yen', 'forex', 'weak won', 'strong won', 'currency market', 'pound falls', 'euro rises', 'devaluation'] },
    { key: 'trade', ko: '무역', en: 'Trade', keywords: ['trade deal', 'trade war', 'export', 'import', 'trade deficit', 'trade surplus', 'wto', 'trade agreement', 'trade negotiations', 'trade barrier'] },
    { key: 'tariffs', ko: '관세', en: 'Tariffs', keywords: ['tariff', 'tariffs', 'customs duty', 'import duty', 'tariff hike', 'trade tariffs'] },
    { key: 'realestate', ko: '부동산', en: 'Real Estate', keywords: ['real estate', 'property market', 'commercial property', 'property prices', 'property tax', 'real estate developer', 'property investment'] },
    { key: 'housing', ko: '주택', en: 'Housing', keywords: ['housing market', 'home prices', 'mortgage rate', 'rent prices', 'housing crisis', 'home sales', 'housing bubble', 'housing supply', 'first-time buyers'] },
    // Narrowed to labor-market STATISTICS per the updated spec (실업률·취업자수·채용시장
    // 동향) — strikes/wage disputes/working conditions now belong to world's 노동
    // (Labor) instead, which is checked much later, so keeping "strike action"/"labor
    // union" here would have stolen all of those stories before 노동 ever got a look.
    { key: 'employment', ko: '고용', en: 'Employment', keywords: ['jobs report', 'unemployment rate', 'unemployment', 'layoffs', 'hiring', 'payroll', 'job cuts', 'workforce', 'job market', 'labor shortage', 'jobless claims', 'employment rate', 'hiring market'] },
    { key: 'householddebt', ko: '가계 부채', en: 'Household Debt', keywords: ['household debt', 'consumer debt', 'credit card debt', 'loan default', 'mortgage debt', 'personal debt', 'student loan debt'] },
    { key: 'growth', ko: '성장률', en: 'Growth Rate', keywords: ['gdp growth', 'economic growth', 'recession', 'gdp contracts', 'growth forecast', 'economic output', 'gdp data', 'economic slowdown', 'growth rate', 'economy slow', 'economy shrink', 'economy contract', 'economy grew', 'economy grows'] },
    { key: 'fiscal', ko: '재정', en: 'Fiscal Policy', keywords: ['budget deficit', 'government spending', 'stimulus package', 'national debt', 'fiscal policy', 'government budget', 'public spending', 'deficit spending'] },
    { key: 'tax', ko: '세금', en: 'Tax System', keywords: ['tax cut', 'tax hike', 'tax reform', 'tax law', 'tax bracket', 'corporate tax', 'income tax', 'tax policy'] },
    { key: 'supplychain', ko: '공급망', en: 'Supply Chain', keywords: ['supply chain', 'chip shortage', 'shortage of', 'factory disruption', 'semiconductor shortage', 'supply disruption', 'manufacturing delay'] },
    { key: 'logisticsdelivery', ko: '물류배송', en: 'Logistics & Delivery', keywords: ['delivery service', 'last-mile delivery', 'warehouse', 'logistics company', 'shipping costs', 'freight rates', 'delivery delays'] },
    { key: 'crypto', ko: '가상화폐', en: 'Crypto', keywords: ['bitcoin', 'ethereum', 'crypto', 'stablecoin', 'nft', 'crypto exchange', 'digital currency', 'altcoin', 'crypto market'] },
    { key: 'blockchain', ko: '블록체인', en: 'Blockchain', keywords: ['blockchain', 'distributed ledger', 'smart contract', 'web3', 'defi'] },
    { key: 'semiconductors', ko: '반도체', en: 'Semiconductors', keywords: ['semiconductor', 'chipmaker', 'foundry', 'chip export', 'chip factory', 'chip industry', 'chip design', 'chip manufacturing'] },
    { key: 'tech', ko: '테크', en: 'Tech', keywords: ['artificial intelligence', ' ai model', 'software firm', 'tech firm', 'data center', 'app launch', 'tech company', 'silicon valley', 'cloud computing', 'tech giant', 'big tech'] },
    { key: 'mobility', ko: '모빌리티', en: 'Mobility', keywords: ['ride-hailing', 'self-driving', 'autonomous vehicle', 'mobility service', 'micromobility', 'scooter sharing', 'airline', 'airline fares'] },
    { key: 'automotive', ko: '자동차', en: 'Automotive', keywords: ['automaker', 'ev maker', 'electric vehicle', 'car manufacturer', 'auto industry', 'car sales', 'vehicle recall'] },
    { key: 'commodities', ko: '원자재', en: 'Commodities', keywords: ['oil price', 'crude', 'gold price', 'commodity prices', 'natural gas price', 'wheat prices', 'copper prices', 'metal prices', 'agricultural commodity', 'silver price'] },
    { key: 'esg', ko: 'ESG', en: 'ESG', keywords: ['esg', 'sustainability report', 'corporate responsibility', 'esg investing', 'esg rating', 'esg fund'] },
    { key: 'carbon', ko: '탄소배출', en: 'Carbon Emissions', keywords: ['carbon emissions target', 'net zero', 'green bond', 'climate pledge', 'carbon footprint', 'carbon tax', 'carbon credit', 'emissions target'] },
    { key: 'consumption', ko: '소비', en: 'Consumption', keywords: ['consumer spending', 'consumer demand', 'consumer confidence', 'holiday shopping', 'black friday'] },
    { key: 'retail', ko: '유통', en: 'Retail & Distribution', keywords: ['retail sales', 'retail industry', 'shopping trends', 'e-commerce', 'retailer', 'department store', 'supermarket chain'] },
    { key: 'investment', ko: '투자', en: 'Investment', keywords: ['investment', 'investing', 'investor', 'invests in', 'stake in', 'ipo', 'goes public', 'stock market', 'shares', 'nasdaq', 'wall street', 'private equity', 'dividend', 'portfolio'] },
    { key: 'venture', ko: '벤처', en: 'Venture Capital', keywords: ['venture capital', 'vc firm', 'venture fund', 'series a', 'series b', 'series c', 'funding round', 'seed funding', 'venture backed'] },
    { key: 'startup', ko: '스타트업', en: 'Startups', keywords: ['startup', 'startups', 'unicorn startup', 'tech startup', 'startup founder', 'startup valuation', 'startup funding'] },
    { key: 'corporate', ko: '기업', en: 'Corporate', keywords: ['merger', 'acquisition', 'acquires', 'takeover', 'bankruptcy', 'chapter 11', 'ceo', 'executive', 'earnings', 'quarterly', 'profit', 'revenue', 'company', 'companies', 'corporate', 'firm', 'firms', 'business deal', 'shareholder', 'restructuring', 'spinoff'] },
    { key: 'finance', ko: '금융', en: 'Finance', keywords: ['bank', 'banks', 'banking', 'lender', 'lenders', 'financial regulator', 'hedge fund', 'insurer', 'sec ', 'wall street', 'financial firm', 'brokerage', 'asset manager', 'financial institution'] }
];

// News RSS feeds nearly universally append " - Outlet Name" to the title. Rather than
// matching a fixed list of outlets (BBC, Bloomberg, ...), strip ANY trailing
// "<sep> <segment>" generically when that segment looks like a name/org/domain rather
// than a continuation of the sentence — i.e. it starts with a capital letter (or digit,
// or looks like a bare hostname e.g. "afrc.af.mil") and is short. This is what tells
// "- Fox News" / "- Click2Houston" / "- The New York Times" (outlet, strip it) apart
// from "- questions remain unanswered" (a real headline clause, starts lowercase, keep it).
function cleanTitle(title) {
    const m = title.match(/^(.*?)\s+[-–—|\/]\s+([^-–—|\/]{1,45})$/);
    if (m) {
        const rest = m[2].trim();
        const looksLikeSource = /^[A-Z0-9]/.test(rest) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(rest);
        if (looksLikeSource) return m[1].trim();
    }
    // The slash specifically also shows up with NO surrounding whitespace in some feeds
    // ("Title/Reuters", "Title /Reuters", "Title/ Reuters") — the pattern above requires
    // a space on BOTH sides and missed all of those, leaving the outlet name stuck to
    // the title. Not extended to -/–/—/| too since bare hyphens routinely appear
    // mid-word in real headline text ("COVID-19", "F-35") where stripping unspaced would
    // wrongly truncate the title itself.
    const slashM = title.match(/^(.*?)\s*\/\s*([^\/]{1,45})$/);
    if (slashM) {
        const rest = slashM[2].trim();
        const looksLikeSource = /^[A-Z0-9]/.test(rest) || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(rest);
        if (looksLikeSource) return slashM[1].trim();
    }
    return title.trim();
}

// Severity/social-impact scoring so the most serious stories (human cost first,
// economic damage second, broader public impact third) sort to the top, and trivial
// items sink — across both the news tabs and the ticker. Tiers are ordered by roughly
// how the underlying event actually hurts people: casualties > violent/existential
// threats > economic damage > disasters/public-health > general significant news.
const SEVERITY_TIERS = [
    { weight: 6, keywords: ['killed', 'dead', 'deaths', 'death toll', 'casualties', 'fatalities', 'died', 'massacre', 'genocide', 'slaughter'] },
    { weight: 5, keywords: ['war', 'invasion', 'nuclear', 'attack', 'airstrike', 'bombing', 'explosion', 'terrorist', 'assassination', 'missile'] },
    { weight: 4, keywords: ['recession', 'market crash', 'financial crisis', 'collapse', 'bankruptcy', 'default', 'mass layoffs', 'plunge'] },
    { weight: 3, keywords: ['earthquake', 'tsunami', 'disaster', 'emergency', 'epidemic', 'pandemic', 'outbreak', 'famine', 'evacuate', 'wildfire', 'flooding'] },
    { weight: 2, keywords: ['crisis', 'sanctions', 'coup', 'ceasefire', 'president', 'election', 'crackdown', 'inflation', 'central bank', 'rate hike', 'rate cut', 'protest', 'strike action'] }
];
// Scale words ("hundreds killed" vs. just "killed") bump an already-severe story
// further up, rather than inflating an otherwise-minor one.
const MAGNITUDE_BOOSTERS = ['hundreds', 'thousands', 'dozens', 'mass ', 'widespread', 'catastrophic', 'unprecedented', 'millions'];
const LOW_IMPORTANCE_KEYWORDS = [
    'celebrity', 'horoscope', 'recipe', 'quiz', 'viral video', 'you won\'t believe', 'royal family style',
    'gossip', 'best deals', 'listicle'
];

// Single-word keywords are matched on word boundaries so e.g. "invest" doesn't match
// inside "investigate", and "war" doesn't match inside "software"/"warning"/"reward".
// Multi-word phrases are matched as plain substrings (word-boundary regex on a phrase
// with spaces works fine too, but this keeps it simple and avoids regex-escaping spaces).
function keywordMatches(lower, keyword) {
    if (/^[a-z0-9&]+$/.test(keyword)) {
        // Allow common regular-English suffixes (attack/attacks/attacked/attacking,
        // arrest/arrested) so a keyword doesn't have to be listed in every inflected
        // form to match — while the trailing \b still blocks unrelated words that just
        // happen to start the same way (e.g. "invest" still won't match "investigate",
        // since "igate" isn't one of the allowed suffixes).
        return new RegExp(`\\b${keyword}(?:s|es|ed|ing)?\\b`).test(lower);
    }
    return lower.includes(keyword);
}

function importanceScore(title) {
    const lower = title.toLowerCase();
    let score = 0;
    SEVERITY_TIERS.forEach(tier => {
        tier.keywords.forEach(k => { if (keywordMatches(lower, k)) score += tier.weight; });
    });
    if (score > 0) {
        const magnitudeHits = MAGNITUDE_BOOSTERS.filter(k => lower.includes(k)).length;
        score += magnitudeHits * 2; // only amplify stories that are already substantive
    }
    LOW_IMPORTANCE_KEYWORDS.forEach(k => { if (keywordMatches(lower, k)) score -= 5; });
    return score;
}

// Context-defense rule: a purely cultural/entertainment figure's death is always
// World/Culture, even when the headline quotes a president/PM's condolences — that
// quote doesn't make it a Politics or Diplomacy story. Deliberately excludes ambiguous
// roles like bare "director"/"conductor" (FBI director, orchestra vs. train conductor)
// that show up constantly in non-arts headlines.
const CULTURE_FIGURE_WORDS = ['actor', 'actress', 'singer', 'musician', 'rapper', 'songwriter', 'composer', 'novelist', 'poet', 'author', 'painter', 'sculptor', 'playwright', 'choreographer', 'dancer', 'comedian', 'artist', 'film director', 'movie director', 'tv host', 'k-pop', 'pop star', 'fashion designer', 'chef'];
// 'kill' catches "killed in crash"/"killed in accident"/etc — not just natural-death
// phrasing. Without it, e.g. "Oscar-winning songwriter killed in crash" matched a
// CULTURE_FIGURE_WORDS word (songwriter) but no DEATH_WORDS word, so it fell all the way
// through to the Politics default despite having nothing to do with politics.
const DEATH_WORDS = ['dies', 'dead at', 'death of', 'obituary', 'passes away', 'passed away', 'has died', 'kill'];
function isCultureFigureObituary(lower) {
    return CULTURE_FIGURE_WORDS.some(w => keywordMatches(lower, w)) && DEATH_WORDS.some(w => keywordMatches(lower, w));
}

// Same idea for sports figures — without this, "NBA legend dies at 78" or "Former World
// Cup captain dies" had no keyword to match at all (the 'sports' topic's keywords are
// event/tournament words, not this), so it fell all the way through to the generic
// Politics fallback (DEFAULT_WORLD_TOPIC) purely for lack of a match, not because the
// story had anything to do with politics.
const SPORTS_FIGURE_WORDS = ['athlete', 'footballer', 'soccer player', 'basketball player', 'baseball player', 'boxer', 'tennis player', 'golfer', 'swimmer', 'sprinter', 'gymnast', 'wrestler', 'olympian', 'nfl', 'nba', 'mlb', 'nhl', 'quarterback', 'pitcher', 'goalkeeper', 'striker', 'cricketer', 'rugby player', 'f1 driver', 'formula 1 driver', 'race car driver', 'figure skater', 'skier', 'cyclist', 'marathon runner', 'gold medalist', 'hall of fame', 'world cup winner', 'world champion boxer', 'nba legend', 'nfl legend'];
function isSportsFigureObituary(lower) {
    return SPORTS_FIGURE_WORDS.some(w => keywordMatches(lower, w)) && DEATH_WORDS.some(w => keywordMatches(lower, w));
}

// Context-defense rule: shipping/logistics vocabulary ("tanker", "cargo ship") doesn't
// make a headline Shipping/Logistics when its actual substance is a military strike or
// seizure — that's War/Security. Scoped to vessel-noun + strong-attack-verb co-
// occurrence so ordinary shipping-market news (freight rates, port congestion) is
// unaffected; checked ahead of the Economy pass below, which would otherwise grab it on
// the vessel noun alone.
const VESSEL_WORDS = ['tanker', 'cargo ship', 'container ship', 'oil tanker', 'vessel', 'warship', 'freighter'];
const MILITARY_ATTACK_WORDS = ['missile strike', 'airstrike', 'air strike', 'drone strike', 'seized', 'seizes', 'hijacked', 'hijack', 'boarded by', 'attacked', 'strikes', 'struck', 'sank', 'sunk', 'torpedoed', 'shelled', 'fired on', 'naval strike'];
function isVesselMilitaryAttack(lower) {
    return VESSEL_WORDS.some(w => keywordMatches(lower, w)) && MILITARY_ATTACK_WORDS.some(w => keywordMatches(lower, w));
}

function classifyNews(title) {
    const lower = title.toLowerCase();

    // Rule (b) — checked first: nothing below should be able to steal a pure culture
    // obituary, regardless of what else the headline happens to mention.
    if (isCultureFigureObituary(lower)) return { group: 'world', topic: WORLD_TOPICS.find(t => t.key === 'culture') };
    // Same priority for sports figures. Deliberately NOT given the same treatment for
    // politicians/military figures — a politician's death still falls through to the War
    // topic below when the headline is actually about being killed in war (e.g. "killed
    // in airstrike"), since 'war' is checked ahead of 'politics' in WORLD_TOPICS — and
    // otherwise correctly lands on Politics via its own keywords (president/minister/
    // etc.), not because of some death-generic default.
    if (isSportsFigureObituary(lower)) return { group: 'world', topic: WORLD_TOPICS.find(t => t.key === 'sports') };

    const isFigurativeWar = WAR_EXCLUDE_PHRASES.some(p => lower.includes(p));

    // Rule (a), second half — checked before the Economy pass so a vessel attack isn't
    // grabbed by Shipping/Logistics on "tanker"/"cargo ship" alone.
    if (!isFigurativeWar && isVesselMilitaryAttack(lower)) {
        return { group: 'world', topic: WORLD_TOPICS.find(t => t.key === 'war') };
    }

    // Rule (a), first half: an economic-outcome headline (stocks fell, Fed froze rates,
    // FX surged) wins as Economy even if it also contains war-sounding words — checking
    // ECON_TOPICS before WORLD_TOPICS is what gives it that priority.
    for (const t of ECON_TOPICS) if (t.keywords.some(k => keywordMatches(lower, k))) return { group: 'economy', topic: t };
    if (WAR_EXCLUDE_TO_CORPORATE.some(p => lower.includes(p))) {
        return { group: 'economy', topic: ECON_TOPICS.find(t => t.key === 'corporate') };
    }
    // Rule (d) falls out of this loop's own ordering: Disaster is checked well before
    // Politics, so a natural-disaster-plus-emergency-declaration headline is Disaster
    // regardless of which official declared it.
    for (const t of WORLD_TOPICS) {
        if (t.key === 'war' && isFigurativeWar) continue;
        if (t.keywords.some(k => keywordMatches(lower, k))) return { group: 'world', topic: t };
    }
    return { group: 'world', topic: DEFAULT_WORLD_TOPIC };
}

function newsItemHtml(n) {
    const topic = n.topic || DEFAULT_WORLD_TOPIC;
    const topicLabel = currentLang === 'ko' ? topic.ko : topic.en;
    const title = (currentLang === 'ko' && n.titleKo) ? applyKoreanNameMap(n.titleKo) : n.title;
    const href = n.link || '#';
    return `
        <div class="news-item">
            <a href="${href}" target="_blank" rel="noopener noreferrer">
                <span class="news-topic">[${escapeHtml(topicLabel)}]</span><span>${escapeHtml(title)}</span>
            </a>
        </div>
    `;
}

function switchNewsTab(tab) {
    newsTab = tab;
    updateNewsTabStyles();
    renderNewsLists(false); // switching tabs shows different content — start at the top
    alignColumnBottoms();
}

function updateNewsTabStyles() {
    const worldBtn = document.getElementById('tab-world-news');
    const econBtn = document.getElementById('tab-econ-news');
    if (!worldBtn || !econBtn) return;
    worldBtn.classList.toggle('text-white', newsTab === 'world');
    worldBtn.classList.toggle('border-b-2', newsTab === 'world');
    worldBtn.classList.toggle('border-green-500', newsTab === 'world');
    worldBtn.classList.toggle('text-gray-600', newsTab !== 'world');
    econBtn.classList.toggle('text-white', newsTab === 'economy');
    econBtn.classList.toggle('border-b-2', newsTab === 'economy');
    econBtn.classList.toggle('border-green-500', newsTab === 'economy');
    econBtn.classList.toggle('text-gray-600', newsTab !== 'economy');
}

// Rather than guessing a fixed item count, MEASURE how many news items it actually
// takes to reach the same bottom line as the FX/rates and markets columns (which are
// fixed-length and already rendered by the time this runs — renderAll() renders them
// first). This is what actually keeps the news box full-height instead of relying on
// an invisible margin hack to fake the alignment.
// The news card's height is pinned to match the middle/right columns by
// fitNewsCardHeight() (CSS height + internal scroll), so this just needs to render
// enough items to comfortably fill and scroll past that height — no more fragile
// item-count-vs-pixel-height guessing here.
// preserveScroll=true (the default) keeps the reader's scroll position across a
// periodic re-render (news refresh, translation landing, column realignment, etc.) —
// without this, replacing #news-container's innerHTML resets scrollTop to 0, which is
// the "scrolling down jumps back to the top" bug. Pass false only for an intentional
// content change like switching tabs, where jumping to the top is correct.
function renderNewsLists(preserveScroll = true) {
    const container = document.getElementById('news-container');
    const savedScrollTop = preserveScroll ? container.scrollTop : 0;

    const pool = masterNews.length ? masterNews : FALLBACK_NEWS.map(n => ({ ...n, topic: classifyNews(n.title).topic, group: classifyNews(n.title).group }));
    const worldItems = pool.filter(n => n.group !== 'economy');
    const econItems = pool.filter(n => n.group === 'economy');
    const activeItems = newsTab === 'economy'
        ? (econItems.length ? econItems : pool)
        : (worldItems.length ? worldItems : pool);
    const count = Math.min(activeItems.length, Math.max(NEWS_ITEMS_PER_TAB, 40));
    container.innerHTML = activeItems.slice(0, count).map(newsItemHtml).join('');
    container.scrollTop = savedScrollTop;
    fitNewsCardHeight();
}

// Pin the news card's height to the taller of the middle/right columns. Content
// shorter than that just leaves the (already-bordered) card at full height; content
// taller than that scrolls inside #news-container (overflow-y-auto) instead of
// growing the card past the line — solves both directions, and re-running this on
// resize keeps it correct at any window/aspect ratio.
// Temporarily clearing newsCard's height (to measure the middle/right columns' natural
// height) collapses #news-container for a moment, which clamps its scrollTop — so this
// was ALSO a source of "scrolling down jumps back to the top", independent of and in
// addition to renderNewsLists()'s innerHTML swap. This is called from several places
// (resize, ResizeObserver, alignColumnBottoms, renderNewsLists...), so the save/restore
// belongs here rather than trying to wrap every call site.
function fitNewsCardHeight() {
    const grid = document.getElementById('main-grid');
    const newsCard = document.getElementById('news-card');
    const newsContainer = document.getElementById('news-container');
    if (!grid || !newsCard || grid.children.length < 3) return;
    const savedScrollTop = newsContainer ? newsContainer.scrollTop : 0;
    const prevHeight = newsCard.style.height;
    newsCard.style.height = ''; // let the middle/right columns report their natural height first
    if (!isMainGridSideBySide(Array.from(grid.children))) {
        // Stacked layout (below lg) — the columns aren't next to each other, so there's
        // nothing to match; leave the news card at its own natural height.
        if (newsContainer) newsContainer.scrollTop = savedScrollTop;
        return;
    }
    const middleHeight = grid.children[1].getBoundingClientRect().height;
    const rightHeight = grid.children[2].getBoundingClientRect().height;
    const target = Math.max(middleHeight, rightHeight);
    if (target <= 0) {
        newsCard.style.height = prevHeight;
        if (newsContainer) newsContainer.scrollTop = savedScrollTop;
        return;
    }
    newsCard.style.height = `${target}px`;
    if (newsContainer) {
        newsContainer.style.maxHeight = '';
        newsContainer.scrollTop = savedScrollTop;
    }
}

function renderTicker() {
    const pool = masterNews.length ? masterNews : FALLBACK_NEWS.map(n => ({ ...n, topic: classifyNews(n.title).topic }));
    let items = pool.slice(0, 24);
    // pad up to at least 20 items so the ticker never looks sparse
    let i = 0;
    while (items.length < 20 && FALLBACK_NEWS.length) {
        items.push({ ...FALLBACK_NEWS[i % FALLBACK_NEWS.length], topic: classifyNews(FALLBACK_NEWS[i % FALLBACK_NEWS.length].title).topic });
        i++;
    }
    const itemHtml = items.map(n => {
        const topic = n.topic || DEFAULT_WORLD_TOPIC;
        const topicLabel = currentLang === 'ko' ? topic.ko : topic.en;
        const title = (currentLang === 'ko' && n.titleKo) ? applyKoreanNameMap(n.titleKo) : n.title;
        return `<span class="ticker-item"><span class="news-topic">[${escapeHtml(topicLabel)}]</span>${escapeHtml(title)}</span>`;
    }).join('');
    const track = document.getElementById('ticker-track');
    // duplicate content once for a seamless loop
    track.innerHTML = itemHtml + itemHtml;
    const duration = Math.max(items.length * 11, 60);
    track.style.animation = `ticker-scroll ${duration}s linear infinite`;
    if (!document.getElementById('ticker-keyframes')) {
        const style = document.createElement('style');
        style.id = 'ticker-keyframes';
        style.textContent = '@keyframes ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }';
        document.head.appendChild(style);
    }
}

// Fetches the RSS feed's raw XML through the same CORS-proxy chain used for Yahoo
// (see CORS_PROXIES) and parses it with the browser's own DOMParser, rather than going
// through rss2json.com's JSON-conversion service. rss2json's free anonymous tier has a
// DAILY quota that 9 feeds polled every minute blows through in under two hours (hit
// it directly: "Daily rate limit exceeded, please try again after 21 hours") — once
// exhausted, every single feed fails at once and the page falls back to the tiny
// 20-item static list, which is what "article count dropped to almost nothing" was.
// Parsing the XML ourselves removes that shared, easily-exhausted quota entirely.
function textOf(item, tag) {
    const el = item.getElementsByTagName(tag)[0];
    return el ? el.textContent.trim() : '';
}

// Races the CORS proxies (via fetchViaProxies, same helper market-data.js uses for
// Yahoo) instead of trying them one after another. Sequential trial-then-fallback meant
// a single down/slow proxy cost every feed a full 6s timeout before the second proxy
// even got a turn — with 24 feeds across several batches, that's what stretched "a
// handful of articles up front, then a long wait before the rest show up" out so long.
// Racing means each feed only ever waits as long as whichever proxy answers first.
async function fetchFeedItems(feed) {
    const res = await fetchViaProxies(feed.url, 6000);
    const xmlText = await res.text();
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    if (doc.querySelector('parsererror')) throw new Error('xml parse error');
    const items = Array.from(doc.getElementsByTagName('item')).slice(0, 25);
    if (items.length === 0) throw new Error('no items in feed');
    return items.map(item => {
        const title = cleanTitle(textOf(item, 'title'));
        const link = textOf(item, 'link') || '#';
        const pubDateText = textOf(item, 'pubDate');
        let classified = classifyNews(title);
        // A headline from a business feed that matched nothing specific isn't
        // automatically economic — CNBC/Bloomberg/etc. also carry geopolitical
        // stories (an Iran cease-fire update, a court case) that have nothing to
        // do with business just because of where they were published. Only
        // reclassify to Corporate when the title itself also carries some actual
        // money/business signal — feed origin alone used to blindly win, which is
        // exactly why "Trump Says There's a 'Good Chance' of an Iran Deal" or a
        // "Felony Theft Charges Filed Against a Business Owner" were landing
        // under Corporate instead of Diplomacy/Conflict or Crime.
        if (feed.isBusinessFeed && classified.group === 'world' && classified.topic === DEFAULT_WORLD_TOPIC) {
            const hasBusinessSignal = BUSINESS_SIGNAL_HINTS.some(h => title.toLowerCase().includes(h));
            if (hasBusinessSignal) {
                classified = { group: 'economy', topic: ECON_TOPICS.find(t => t.key === 'corporate') };
            }
        }
        return {
            title,
            link,
            pubDate: pubDateText ? new Date(pubDateText) : new Date(),
            topic: classified.topic,
            group: classified.group
        };
    });
}

// Dedupes/classifies/sorts/caps and paints whatever raw feed items have landed SO FAR.
// Pulled out of fetchAllNews so it can run after every batch (see below) instead of
// only once all ~24 feeds have finished — that "only render at the very end" behavior
// was the other half of "a few articles show up, then a long wait before the rest
// appear": each batch could itself take several seconds, and there are 4 of them.
function applyNewsPool(combined) {
    if (combined.length === 0) return;
    const seen = new Set();
    const deduped = [];
    combined.forEach(item => {
        const key = item.title.slice(0, 40);
        if (!seen.has(key)) { seen.add(key); deduped.push(item); }
    });
    // Drop non-literal "wars" already handled in classifyNews (kept in their real topic).
    // Rank by importance first, recency second, so serious/high-impact stories surface
    // and minor items sink — across both tabs and the ticker.
    deduped.sort((a, b) => {
        const scoreDiff = importanceScore(b.title) - importanceScore(a.title);
        if (scoreDiff !== 0) return scoreDiff;
        return b.pubDate - a.pubDate;
    });
    // Cap world and economy SEPARATELY, not the combined pool — war/disaster stories
    // score far higher under importanceScore() than typical economic stories, so a
    // single global cap on the whole (already severity-sorted) list let 세계소식 crowd
    // 경제소식 out of the pool almost entirely, even when raw economic supply was
    // healthy (~100 items pre-cap). Each filter preserves the existing severity sort,
    // so this only changes WHICH items survive the cap, not the ordering within a group.
    const dedupedWorld = deduped.filter(n => n.group !== 'economy');
    const dedupedEcon = deduped.filter(n => n.group === 'economy');
    const balanced = [...dedupedWorld.slice(0, 90), ...dedupedEcon.slice(0, 90)];
    // Each cycle rebuilds fresh item objects from the raw feeds, which used to throw
    // away every already-translated titleKo and force a full re-translate of the
    // entire pool (~40-90 items) every single 60s refresh — that churn was the real
    // driver behind hitting Google Translate's rate limit. Carry translations forward
    // by matching on the (already-cleaned) title text.
    const previousTranslations = new Map(masterNews.filter(n => n.titleKo).map(n => [n.title, n.titleKo]));
    masterNews = balanced;
    masterNews.forEach(n => {
        const ko = previousTranslations.get(n.title);
        if (ko) n.titleKo = ko;
    });
    renderNewsLists();
    renderTicker();
    alignColumnBottoms();
    saveNewsCache();
    if (currentLang === 'ko') translateNewsIfNeeded();
}

// Firing all ~29 feeds through the free corsfix proxy at once causes it to randomly
// reject a chunk of them under the burst (observed: identical feed list yielding econ
// counts anywhere from 26 to 56 across back-to-back runs). Fetching in small staggered
// batches keeps peak concurrent load on the proxy low, which is far more consistent.
async function fetchAllNews() {
    const BATCH_SIZE = 6;
    const BATCH_DELAY_MS = 300;
    let combined = [];
    for (let i = 0; i < NEWS_FEEDS.length; i += BATCH_SIZE) {
        const batch = NEWS_FEEDS.slice(i, i + BATCH_SIZE);
        const results = await Promise.allSettled(batch.map(fetchFeedItems));
        results.forEach(r => { if (r.status === 'fulfilled') combined = combined.concat(r.value); });
        // Paint after every batch so the news box fills in progressively instead of
        // sitting on the sparse fallback/cache until the whole feed list is done.
        applyNewsPool(combined);
        if (i + BATCH_SIZE < NEWS_FEEDS.length) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
    if (combined.length === 0 && masterNews.length === 0) { renderNewsLists(); renderTicker(); }
}

// Firing 30-50+ translate calls at once (one per untranslated headline) trips Google's
// unofficial-endpoint rate limiting, which used to silently fail the whole batch to
// English (see translateToKorean's old behavior). Small sequential batches with a
// short gap keep it well under whatever that limit is, and progressively re-rendering
// after each batch means titles turn Korean as they land instead of all-or-nothing.
let translateInProgress = false;
async function translateNewsIfNeeded() {
    if (translateInProgress) return;
    const untranslated = masterNews.filter(n => !n.titleKo);
    if (untranslated.length === 0) return;
    // Prioritize whatever's actually visible right now (the active tab's on-screen
    // items) ahead of the rest of the background pool. With up to 180 items across both
    // tabs and the translate endpoint only safely handling 5 calls at a time (see the
    // comment above), translating in raw array order meant the tab NOT currently open —
    // whose items sit later in the array, since world is concatenated before economy —
    // could take a long stretch to catch up, showing English titles on exactly the tab
    // the reader was looking at even though translation was actively running.
    const visiblePool = new Set(
        masterNews.filter(n => newsTab === 'economy' ? n.group === 'economy' : n.group !== 'economy').slice(0, 40)
    );
    untranslated.sort((a, b) => (visiblePool.has(b) ? 1 : 0) - (visiblePool.has(a) ? 1 : 0));
    translateInProgress = true;
    try {
        const batchSize = 5;
        for (let i = 0; i < untranslated.length; i += batchSize) {
            const batch = untranslated.slice(i, i + batchSize);
            await Promise.all(batch.map(async n => {
                const result = await translateToKorean(n.title);
                if (result) n.titleKo = result; // leave unset (falsy) on failure so it's retried later
            }));
            if (currentLang === 'ko') { renderNewsLists(); renderTicker(); alignColumnBottoms(); }
            if (i + batchSize < untranslated.length) await new Promise(r => setTimeout(r, 300));
        }
        saveNewsCache(); // persist the newly-translated titles so a reload doesn't re-translate from scratch
    } finally {
        translateInProgress = false;
    }
}

