// Copy this file to config.js and fill in your own free-tier key from
// https://site.financialmodelingprep.com/ — market-data.js's fetchAllFmp uses it for the
// US 2-year treasury yield, the one instrument with no free ticker anywhere else (see the
// comment above fetchAllFmp in market-data.js). Without it, that row just falls back to
// its static fallback value — nothing else on the page depends on this key anymore.
//
// NOTE: this key is used directly in browser fetch() calls, so it is visible to anyone
// who opens devtools/view-source on the deployed page, regardless of git history. Keeping
// it out of the repo only keeps it out of the GitHub source listing — rotate it on FMP's
// dashboard if it's ever actually abused.
const FMP_API_KEY = 'YOUR_FMP_API_KEY_HERE';
