
// ============================ NEWS ============================

// Ordered non-Google feeds first, then Google News queries, deliberately — NOT the
// order these were added in. Verified per-feed against the current proxy
// (cors-get-proxy.sirjosh.workers.dev, see ALL_CORS_PROXIES in market-data.js) on
// 2026-09-17: every non-Google feed below answers in well under a second, while EVERY
// news.google.com/rss/search query fails, and most of those don't fail fast — they hang
// for the entire per-feed timeout (Google evidently blocks or throttles this proxy's
// shared IP). fetchAllNews() batches NEWS_FEEDS in fixed-size chunks in array order, so
// with Google queries scattered throughout the old list, EVERY batch contained at least
// one guaranteed-to-hang feed and paid the full timeout — 4 batches x ~6s of pure dead
// air, which is what "뉴스기사나 차트가 엄청 늦게 떠" was actually measuring. With all
// the fast, reliable feeds grouped first, those batches resolve and paint real headlines
// in well under a second; the Google batches at the end still get tried (each feed given
// its own shorter GOOGLE_NEWS_TIMEOUT_MS in news.js, since we already know they're very
// unlikely to succeed) but no longer block the page from looking fully loaded first.
const NEWS_FEEDS = [
    { url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', isBusinessFeed: true },
    { url: 'http://rss.cnn.com/rss/edition_world.rss' },
    { url: 'http://rss.cnn.com/rss/money_latest.rss', isBusinessFeed: true },
    // Reuters and Bloomberg deliberately excluded — both put full article text behind a
    // paywall, so a headline surfaced here just leads to a page the reader can't read.
    { url: 'https://www.aljazeera.com/xml/rss/all.xml' },
    // More dedicated business/economy wire feeds (found + verified working via curl on
    // 2026-07-27) — same proxy+XML pipeline as everything else, just more raw economic
    // supply so 경제소식 doesn't run dry before 세계소식 does.
    { url: 'https://www.theguardian.com/uk/business/rss', isBusinessFeed: true },
    { url: 'https://www.forbes.com/business/feed/', isBusinessFeed: true },
    { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', isBusinessFeed: true },
    { url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', isBusinessFeed: true },
    // Fortune excluded — metered paywall blocks reading past the first few free articles.
    { url: 'https://www.investing.com/rss/news.rss', isBusinessFeed: true },
    // Everything below is a news.google.com/rss/search query — see the comment above
    // NEWS_FEEDS for why these are grouped last and given a short timeout instead of
    // being removed outright (kept in case the proxy situation changes and they start
    // working again; see the corsfix domain-registration note in market-data.js).
    // Extra economy/business-scoped queries — the wire feeds above skew world-news
    // heavy, so without these the "economic" tab runs out of items well before 세계소식.
    { url: 'https://news.google.com/rss/search?q=when:24h+(business+OR+economy+OR+markets+OR+earnings)&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+site:cnbc.com&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    // Extra serious/high-impact world-news queries — raw supply of non-economy items
    // was the actual bottleneck keeping the news box shorter than the other columns.
    { url: 'https://news.google.com/rss/search?q=when:24h+(war+OR+conflict+OR+crisis+OR+disaster+OR+diplomacy)&hl=en-US&gl=US&ceid=US:en' },
    { url: 'https://news.google.com/rss/search?q=when:24h+world&hl=en-US&gl=US&ceid=US:en' },
    // Sub-topic queries so the pool has genuinely DIFFERENT stories, not just more
    // outlets re-covering the same handful of headline stories (dedup was collapsing
    // ~102 raw econ items down to ~38 unique ones — more outlets alone wasn't fixing
    // that, more distinct angles should).
    { url: 'https://news.google.com/rss/search?q=when:24h+(stocks+OR+shares+OR+nasdaq+OR+"stock+market")&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+(crypto+OR+bitcoin+OR+cryptocurrency)&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+(housing+OR+"real+estate"+OR+mortgage)&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+(inflation+OR+"interest+rates"+OR+"central+bank")&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+(jobs+OR+employment+OR+layoffs+OR+unemployment)&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true },
    { url: 'https://news.google.com/rss/search?q=when:24h+(semiconductor+OR+chips+OR+chipmaker)&hl=en-US&gl=US&ceid=US:en', isBusinessFeed: true }
];

const FALLBACK_NEWS = [
    { title: 'Markets on edge as central banks weigh next rate move', link: '#' },
    { title: 'Oil prices swing on renewed Middle East supply concerns', link: '#' },
    { title: 'Tech shares lead gains as earnings season kicks off', link: '#' },
    { title: 'Dollar steadies against major peers ahead of data releases', link: '#' },
    { title: 'European leaders meet to discuss trade policy coordination', link: '#' },
    { title: 'Gold holds near record highs amid safe-haven demand', link: '#' },
    { title: 'Asian equities mixed as investors digest China data', link: '#' },
    { title: 'Bond yields tick higher on inflation expectations', link: '#' },
    { title: 'Bank of England signals cautious approach to further cuts', link: '#' },
    { title: 'Crypto markets volatile as bitcoin tests key support', link: '#' },
    { title: 'Global supply chains adjust to shifting tariff landscape', link: '#' },
    { title: 'Consumer confidence data awaited across major economies', link: '#' },
    { title: 'Protests continue over cost-of-living pressures in several capitals', link: '#' },
    { title: 'Diplomats meet to discuss ceasefire prospects', link: '#' },
    { title: 'Flooding displaces thousands in latest natural disaster', link: '#' },
    { title: 'Major retailer files for bankruptcy protection', link: '#' },
    { title: 'Tech company announces expansion into new overseas market', link: '#' },
    { title: 'Regulators review proposed merger between two large firms', link: '#' },
    { title: 'Real estate prices climb in several major cities', link: '#' },
    { title: 'Lawmakers debate new tax policy proposal', link: '#' }
];

// World-news topic keywords (fine label shown in brackets, e.g. [분쟁]).
// Checked AFTER economy topics, so anything with clear money/market centrality is
// classified as economic first (see classifyNews below).
// Each category's keyword list is meant to be broad enough to actually catch how these
// stories get worded in real headlines — a narrow list just means everything falls
// through to the Politics/Corporate catch-alls at the bottom, which defeats the point
// of having 20+ distinct categories in the first place.
// User-specified taxonomy: a STRICT, ordered priority list (checked top to bottom,
// first match wins). Keywords for each category are deliberately chosen to avoid
// stepping on categories that appear LATER in this exact order (e.g. 무역/Trade's
// keywords exclude "tariff" since that belongs to 관세/Tariffs, which is checked
// right after it) — a later, more specific category can never win if an earlier,
// broader one already claims its vocabulary.
