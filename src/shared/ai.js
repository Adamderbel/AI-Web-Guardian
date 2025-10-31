// Chrome Summarizer API utility
// References: https://developer.chrome.com/docs/ai/summarizer-api
export async function summarizeText(text) {
    try {
        // Availability check (models may need download time)
        // @ts-ignore - Summarizer is provided by Chrome AI runtime
        const Summ = globalThis.ai?.summarizer ?? globalThis.Summarizer; // support both namespaced and global
        if (!Summ?.availability) {
            return 'Model not available yet. Please wait for Chrome to download the on-device model.';
        }
        const avail = await Summ.availability?.();
        if (!avail || avail === 'no') {
            return 'Model not available yet. Please wait for Chrome to download the on-device model.';
        }
        // @ts-ignore - create() exists in Chrome 138+
        const summarizer = await Summ.create?.({
            // You may choose other modes like 'key-points'
            type: 'key-points',
            format: 'markdown',
            outputLanguage: 'en'
        });
        if (!summarizer?.summarize)
            return null;
        const res = await summarizer.summarize(text.slice(0, 20000));
        return typeof res === 'string' ? res : JSON.stringify(res);
    }
    catch (e) {
        return `Summarizer error: ${e.message}`;
    }
}
// Language detection helpers
export async function detectLanguage(text) {
    try {
        const g = globalThis;
        // Use namespaced or global fallback
        // @ts-ignore
        const LD = g.ai?.languageDetector ?? g.LanguageDetector;
        const avail = await LD?.availability?.();
        if (!avail || avail === 'no')
            return { note: 'Language detector model not available yet.' };
        // @ts-ignore
        const detector = await LD?.create?.();
        if (!detector?.detect)
            return { note: 'Language detector unavailable.' };
        // Build a sample from the first few lines to avoid scanning the whole site
        const lines = (text || '').split(/\r?\n/).slice(0, 30).join('\n');
        const sample = lines.slice(0, 4000);
        const result = await detector.detect(sample);
        const normalizeCode = (c) => {
            if (!c)
                return undefined;
            const lower = c.toLowerCase();
            return lower.split(/[-_]/)[0] || lower;
        };
        const toCandidate = (x) => {
            if (!x)
                return { code: undefined, prob: undefined };
            const code = x.detectedLanguage || x.language || x.bcp47 || x.languageCode || x.lang || x.code;
            const prob = x.probability ?? x.confidence ?? x.score;
            return { code: normalizeCode(String(code || '')), prob: typeof prob === 'number' ? prob : undefined };
        };
        const arr = Array.isArray(result) ? result : [result];
        const candidates = arr.map(toCandidate).filter(c => c.code);
        // pick highest probability if present, else first
        const top = candidates.sort((a, b) => (b.prob ?? -1) - (a.prob ?? -1))[0] || candidates[0] || { code: undefined, prob: undefined };
        return { code: top.code, probability: top.prob };
    }
    catch (e) {
        return { note: `Language detection error: ${e.message}` };
    }
}
export async function translateToEnglish(_text) {
    // Translator intentionally disabled everywhere.
    return { note: 'Translator disabled' };
}
