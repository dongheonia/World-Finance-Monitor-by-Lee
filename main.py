from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import subprocess
import csv
import io
import math
import time

app = FastAPI(title="World Finance Monitor Local Data Bridge")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Symbols the dashboard's free cloud APIs (FMP, Twelve Data) gate behind a paid plan, but
# which Yahoo Finance itself has fine — the only problem in the browser is that Yahoo sends no
# CORS headers, so it has to go through a public proxy that's often down or rate-limited.
# Running this locally sidesteps that entirely (no proxy, no CORS problem, no rate limit).
GAP_SYMBOLS = {
    "^GDAXI": "Germany DAX",
    "000001.SS": "Shanghai Composite",
    "^KS11": "KOSPI",
    "CL=F": "WTI Crude",
    "NG=F": "Natural Gas",
    "HG=F": "Copper",
    "ZW=F": "Wheat",
}


def clean_value(val):
    if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
        return None
    return round(float(val), 4)


def quote_for(symbol: str):
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period="5d")
    # Some symbols (e.g. 000001.SS) get a placeholder row for the current session before its
    # close price actually lands — drop NaN closes so "latest" means the latest REAL price.
    hist = hist[hist["Close"].notna()]
    if hist.empty or len(hist) < 2:
        return None
    current = hist["Close"].iloc[-1]
    prev = hist["Close"].iloc[-2]
    change = current - prev
    change_percent = (change / prev) * 100 if prev else 0
    return {
        "current": clean_value(current),
        "change": clean_value(change),
        "change_percent": clean_value(change_percent),
    }


@app.get("/api/quotes")
def get_quotes(symbols: str = Query(None, description="Comma-separated Yahoo symbols; defaults to the dashboard's gap list")):
    """Returns {symbol: {current, change, change_percent}} — same shape index.html's
    cachedData already uses, so the frontend can drop these straight in."""
    wanted = [s.strip() for s in symbols.split(",") if s.strip()] if symbols else list(GAP_SYMBOLS.keys())
    out = {}
    for symbol in wanted:
        try:
            quote = quote_for(symbol)
            out[symbol] = quote if quote is not None else {"error": "no data"}
        except Exception as e:
            out[symbol] = {"error": str(e)}
    return out


@app.get("/api/health")
def health():
    return {"status": "ok", "gap_symbols": list(GAP_SYMBOLS.keys())}


# Non-US 10Y government bond yields: no free browser-callable API has these (checked FMP,
# Twelve Data, Yahoo — none of it exists or isn't CORS-enabled). FRED (St. Louis Fed) has
# OECD long-term-rate data for most of them, published monthly, and — critically — FRED's CSV
# endpoint has NO CORS header, so a browser can't call it directly, but a server-side request
# like this one isn't subject to CORS at all. China isn't in this dataset (not an OECD member)
# and has no free source anywhere; it stays on the dashboard's manual fallback value.
FRED_BOND_SERIES = {
    "GB10Y=RR": "IRLTLT01GBM156N",  # United Kingdom
    "FR10Y=RR": "IRLTLT01FRM156N",  # France
    "DE10Y=RR": "IRLTLT01DEM156N",  # Germany
    "JP10Y=RR": "IRLTLT01JPM156N",  # Japan
    "KR10Y=RR": "IRLTLT01KRM156N",  # Korea
}


def fred_latest_change(series_id: str, attempts: int = 4):
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    # Deliberately shells out to curl rather than using `requests` — FRED sits behind Akamai
    # bot protection that intermittently hangs/blocks Python's requests/urllib3 (by TLS
    # fingerprint, near as I can tell) while curl mostly passes through. "Mostly" is still not
    # "always" for curl either — it's genuinely flaky call to call, not a fixed block — so this
    # retries a few times with a short gap before giving up.
    last_err = None
    for attempt in range(attempts):
        if attempt > 0:
            time.sleep(1.5)
        try:
            result = subprocess.run(
                ["curl", "-s", "--max-time", "8", "-A", "Mozilla/5.0", url],
                capture_output=True, text=True, timeout=12,
            )
            if result.returncode != 0 or not result.stdout.strip():
                raise RuntimeError(f"curl failed (code {result.returncode})")
            rows = list(csv.reader(io.StringIO(result.stdout)))
            data_rows = [r for r in rows[1:] if len(r) == 2 and r[1] not in ("", ".")]
            if len(data_rows) < 2:
                return None
            latest_date, latest_val = data_rows[-1]
            _, prev_val = data_rows[-2]
            current = float(latest_val)
            prev = float(prev_val)
            change = current - prev
            change_percent = (change / prev) * 100 if prev else 0
            return {
                "current": clean_value(current),
                "change": clean_value(change),
                "change_percent": clean_value(change_percent),
                "as_of": latest_date,  # FRED publishes monthly, so this is a real (not live-tick) date
            }
        except Exception as e:
            last_err = e
    raise last_err


# FRED only publishes monthly anyway, and its endpoint is flaky, so this is fetched at most
# once per CACHE_TTL_SECONDS and served from an in-memory cache the rest of the time — the
# frontend can poll /api/bond-yields as often as it wants without re-hitting (and re-risking)
# FRED on every call. A value that has never been fetched shows as {"error": ...} until the
# first successful background refresh lands.
_bond_yield_cache = {"data": {}, "fetched_at": 0}
CACHE_TTL_SECONDS = 30 * 60


def refresh_bond_yield_cache():
    out = {}
    for our_symbol, series_id in FRED_BOND_SERIES.items():
        try:
            result = fred_latest_change(series_id)
            out[our_symbol] = result if result else {"error": "no data"}
        except Exception as e:
            # Keep the previous good value on a failed refresh rather than blanking it out.
            out[our_symbol] = _bond_yield_cache["data"].get(our_symbol) or {"error": str(e)}
    _bond_yield_cache["data"] = out
    _bond_yield_cache["fetched_at"] = time.time()


@app.get("/api/bond-yields")
def get_bond_yields():
    if time.time() - _bond_yield_cache["fetched_at"] > CACHE_TTL_SECONDS:
        refresh_bond_yield_cache()
    return _bond_yield_cache["data"]
