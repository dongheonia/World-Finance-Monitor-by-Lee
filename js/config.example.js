// Copy this file to config.js and fill in your own free-tier key from
// https://site.financialmodelingprep.com/ — market-data.js's fetchFmpQuoteShort/fetchAllFmp
// use it for S&P 500/Nasdaq/Dow/FTSE/Euro Stoxx/Hang Seng/Nikkei, Gold/Silver/Brent, and
// US 10Y/2Y treasury yields (see the comment above FMP_API_KEY's usage in market-data.js).
// Without it, those specific rows just fall back to the existing Yahoo-proxy path / static
// fallback values — nothing else on the page depends on this key.
//
// NOTE: this key is used directly in browser fetch() calls, so it is visible to anyone
// who opens devtools/view-source on the deployed page, regardless of git history. Keeping
// it out of the repo only keeps it out of the GitHub source listing — rotate it on FMP's
// dashboard if it's ever actually abused.
const FMP_API_KEY = 'YOUR_FMP_API_KEY_HERE';
