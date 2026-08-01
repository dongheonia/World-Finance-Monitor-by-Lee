async function translateViaGoogle(text) {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ko&dt=t&q=${encodeURIComponent(text)}`);
    if (!res.ok) throw new Error('google http ' + res.status);
    const data = await res.json();
    return data[0].map(chunk => chunk[0]).join('');
}

async function translateViaMyMemory(text) {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|ko`);
    if (!res.ok) throw new Error('mymemory http ' + res.status);
    const data = await res.json();
    const translated = data && data.responseData && data.responseData.translatedText;
    if (!translated) throw new Error('mymemory: no translation returned');
    return translated;
}
// Google frequently translates a proper noun AND echoes the original English right after
// in parentheses — "하버드 대학교(Harvard University)", "미국 적십자(American Red Cross)" — even
// though the Korean already fully conveys it. No name map can cover every school/charity/
// small company this happens to, so instead of mapping each one individually, strip any
// parenthetical whose content is pure Latin script (a real Korean aside like "(43세)" or a
// mixed note never matches, since it requires letters and rejects Hangul).
function stripEnglishEcho(text) {
    return text.replace(/\s*\([A-Za-z][A-Za-z0-9&.,'’\-\s]{1,60}\)/g, '').trim();
}
function applyKoreanNameMap(text) {
    let result = text;
    for (const [en, ko] of KOREAN_NAME_MAP) {
        if (result.includes(en)) result = result.split(en).join(ko);
    }
    return stripEnglishEcho(result);
}

// Google's unofficial endpoint is the primary source, but some networks/browser
// setups block it outright (unrelated to the rate-limiting this file used to hit) —
// MyMemory is a second, independent, CORS-enabled provider as a fallback so a
// Google-specific block doesn't leave every headline stuck in English.
// Returns null if BOTH fail, so the caller can tell "not translated yet" apart from
// "genuinely translated" and retry it next cycle rather than freezing it in English.
async function translateToKorean(text) {
    let translated = null;
    try {
        translated = await translateViaGoogle(text);
    } catch (e) {
        console.warn('Google Translate failed, trying MyMemory fallback:', e.message);
    }
    if (!translated) {
        try {
            translated = await translateViaMyMemory(text);
        } catch (e) {
            console.warn('MyMemory fallback also failed, will retry next cycle:', e.message);
            return null;
        }
    }
    return applyKoreanNameMap(translated);
}

