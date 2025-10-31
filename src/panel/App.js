import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { summarizeText, detectLanguage } from '@shared/ai';
export default function App() {
    const [tabId, setTabId] = useState(null);
    const [status, setStatus] = useState('Loading...');
    const [analysis, setAnalysis] = useState(null);
    const [pageText, setPageText] = useState('');
    const [selectionText, setSelectionText] = useState('');
    const pageTextRef = useRef('');
    const selectionTextRef = useRef('');
    const [pageSummary, setPageSummary] = useState('');
    const [selectionSummary, setSelectionSummary] = useState('');
    const [consentSummary, setConsentSummary] = useState('');
    const [threatsSummary, setThreatsSummary] = useState('');
    const [logs, setLogs] = useState([]);
    const [aiStatus, setAiStatus] = useState('');
    const [isSummarizing, setIsSummarizing] = useState(false);
    const isSummarizingRef = useRef(false);
    useEffect(() => { isSummarizingRef.current = isSummarizing; }, [isSummarizing]);
    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const t = tabs[0];
            if (t?.id != null) {
                setTabId(t.id);
                requestAnalysis(t.id);
            }
        });
        const onMsg = (msg) => {
            if (msg?.type === 'BG/ANALYSIS') {
                setAnalysis(msg.analysis);
                setStatus('');
            }
            if (msg?.type === 'BG/STATUS')
                setStatus(msg.text);
            if (msg?.type === 'CONTENT/PAGE_TEXT') {
                const t = msg.text || '';
                setPageText(t);
                pageTextRef.current = t;
            }
            if (msg?.type === 'CONTENT/SELECTION_TEXT') {
                const t = msg.text || '';
                setSelectionText(t);
                selectionTextRef.current = t;
            }
        };
        chrome.runtime.onMessage.addListener(onMsg);
        return () => chrome.runtime.onMessage.removeListener(onMsg);
    }, []);
    useEffect(() => {
        let cancelled = false;
        const poll = async () => {
            const g = globalThis;
            const Summ = g.ai?.summarizer ?? g.Summarizer;
            const Detect = g.ai?.languageDetector ?? g.LanguageDetector;
            const sumAvail = Summ?.availability ? await Summ.availability() : 'missing';
            const detAvail = Detect?.availability ? await Detect.availability() : 'missing';
            // Do not override in-progress messages
            if (!cancelled && !isSummarizingRef.current)
                setAiStatus(`AI status → Summarizer: ${String(sumAvail)} | Detector: ${String(detAvail)}`);
        };
        // Initial probe + poll up to ~30s (every 2s)
        let tries = 0;
        const id = setInterval(async () => {
            tries++;
            await poll();
            if (tries >= 15)
                clearInterval(id);
        }, 2000);
        poll();
        return () => { cancelled = true; clearInterval(id); };
    }, []);
    async function requestAnalysis(tabId) {
        const req = { type: 'PANEL/GET_ANALYSIS', tabId };
        const resp = await chrome.runtime.sendMessage(req);
        if (resp?.type === 'BG/ANALYSIS') {
            setAnalysis(resp.analysis);
            setStatus('');
            setLogs(resp.analysis.verdict?.logs || []);
        }
        else if (resp?.type === 'BG/STATUS')
            setStatus(resp.text);
    }
    async function onSummarizePage() {
        if (!tabId)
            return;
        await chrome.runtime.sendMessage({ type: 'PANEL/SUMMARIZE_PAGE', tabId });
        setAiStatus('🔍 Detecting language...');
        // Wait up to ~2s for pageText to arrive on first run
        let tries = 0;
        while (!pageTextRef.current && tries < 20) {
            await new Promise(r => setTimeout(r, 100));
            tries++;
        }
        const textSrc = pageTextRef.current || pageText;
        if (textSrc) {
            setIsSummarizing(true);
            const prompt = `Summarize the following webpage content clearly and concisely. Include:
        - Key points and claims
        - Any privacy/security concerns (trackers, forms, payments)
        - Actionable next steps for the user
        Use short bullet points and plain English.

        ${textSrc.slice(0, 20000)}`;
            const s = await summarizeWithLanguage(prompt, textSrc.slice(0, 5000));
            setPageSummary(s || '');
        }
    }
    async function onSummarizeSelection() {
        if (!tabId)
            return;
        await chrome.runtime.sendMessage({ type: 'PANEL/SUMMARIZE_SELECTION', tabId });
        setAiStatus('🔍 Detecting language...');
        // Wait up to ~2s for selectionText to arrive
        let triesSel = 0;
        while (!selectionTextRef.current && triesSel < 20) {
            await new Promise(r => setTimeout(r, 100));
            triesSel++;
        }
        const selSrc = selectionTextRef.current || selectionText;
        if (selSrc) {
            setIsSummarizing(true);
            const prompt = `Summarize this selection with emphasis on clarity and user actions. Include:
        - What it says in plain English
        - Any risks, commitments, or costs
        - What to do next

        ${selSrc.slice(0, 12000)}`;
            const s = await summarizeWithLanguage(prompt, selSrc.slice(0, 5000));
            setSelectionSummary(s || '');
        }
    }
    async function onSummarizeConsent() {
        if (!analysis)
            return;
        const texts = analysis.consent.findings
            .map(f => f.text)
            .filter(Boolean)
            .join('\n\n')
            .slice(0, 20000);
        if (!texts) {
            setConsentSummary('No consent banner text detected to summarize.');
            return;
        }
        const prompt = `Summarize the following consent banner text into concise bullet points. Focus on data categories collected, pre-checked options, and opt-out availability.\n\n${texts}`;
        setAiStatus('🔍 Detecting language...');
        setIsSummarizing(true);
        const s = await summarizeWithLanguage(prompt, texts.slice(0, 5000));
        setConsentSummary(s || '');
    }
    async function onExplainThreats() {
        if (!analysis)
            return;
        const trackerLines = analysis.threats.trackers
            .map(t => `Tracker: ${t.domain} (type: ${t.type})`)
            .join('\n');
        const fpLines = analysis.threats.fingerprintingSignals
            .map(s => `Signal: ${s}`)
            .join('\n');
        const body = [trackerLines, fpLines].filter(Boolean).join('\n');
        if (!body) {
            setThreatsSummary('No trackers or fingerprinting signals to explain.');
            return;
        }
        const prompt = `Explain in plain English what the following trackers and fingerprinting signals imply for privacy. Provide short, actionable guidance.\n\n${body}`;
        setAiStatus('🔍 Detecting language...');
        setIsSummarizing(true);
        const s = await summarizeWithLanguage(prompt, body.slice(0, 5000));
        setThreatsSummary(s || '');
    }
    async function summarizeWithLanguage(text, detectionText) {
        setIsSummarizing(true);
        try {
            const det = await detectLanguage((detectionText ?? text));
            let working = text;
            let note = '';
            const normalizeCode = (c) => {
                if (!c)
                    return undefined;
                const lower = c.toLowerCase();
                // Treat 'root' as English from some detectors
                if (lower === 'root')
                    return 'en';
                // Take primary subtag (e.g., es-es -> es)
                const base = lower.split(/[-_]/)[0];
                return base || lower;
            };
            const getLanguageName = (code) => {
                const base = normalizeCode(code);
                const fallbackMap = {
                    en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese',
                    zh: 'Chinese', ru: 'Russian', ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
                    fi: 'Finnish', ko: 'Korean', pl: 'Polish', tr: 'Turkish', uk: 'Ukrainian', el: 'Greek', he: 'Hebrew', ro: 'Romanian',
                    cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese'
                };
                // Prefer base normalization first (so 'root' -> 'en' -> 'English')
                if (base && fallbackMap[base])
                    return fallbackMap[base];
                try {
                    const dn = globalThis.Intl?.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'language' }) : null;
                    if (dn) {
                        if (base) {
                            const byBase = dn.of(base);
                            if (byBase && typeof byBase === 'string')
                                return byBase[0].toUpperCase() + byBase.slice(1);
                        }
                        if (code) {
                            const byCode = dn.of(code);
                            if (byCode && typeof byCode === 'string')
                                return byCode[0].toUpperCase() + byCode.slice(1);
                        }
                    }
                }
                catch { }
                if (code)
                    return (code === 'root' ? 'English' : code.toUpperCase());
                return 'Unknown';
            };
            const langLabel = getLanguageName(det?.code);
            if (det?.code && normalizeCode(det.code) !== 'en') {
                setAiStatus(`🌐 ${langLabel} detected\n🧠 Summarizing original content (translation skipped)`);
                note = `(Original language: ${langLabel})\n\n`;
                await chrome.runtime.sendMessage({ type: 'PANEL/LANG_LOG', text: `🌐 ${langLabel} detected` });
            }
            else if (normalizeCode(det?.code) === 'en') {
                setAiStatus('🌐 English detected\n🧠 Summarizing original content (translation skipped)');
            }
            else {
                setAiStatus('🌐 Unknown language detected\n🧠 Summarizing original content (translation skipped)');
            }
            const s = await summarizeText(working);
            if (!s) {
                setAiStatus('Summarizer unavailable. If models are still downloading, retry shortly.');
                return null;
            }
            setAiStatus('✅ Summary ready');
            return `${note}${s}`;
        }
        finally {
            setIsSummarizing(false);
        }
    }
    const trustScore = useMemo(() => {
        if (!analysis)
            return '—';
        let score = 100;
        if (!analysis.trust.isHttps)
            score -= 40;
        if (analysis.threats.trackers.length > 0)
            score -= Math.min(analysis.threats.trackers.length * 3, 30);
        if (analysis.threats.fingerprintingSignals.length > 0)
            score -= 10;
        return Math.max(0, score);
    }, [analysis]);
    const risk = analysis?.verdict?.risk || 'secure';
    const riskLabel = risk === 'secure' ? 'safe' : risk;
    return (_jsxs("div", { style: { fontFamily: 'Inter, system-ui, Arial', padding: 14, width: 440, background: '#fafafa', border: '1px solid #eee', borderRadius: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: [_jsx("h2", { style: { marginTop: 0, fontSize: 18 }, children: "AI Web Guardian" }), analysis && (_jsx("div", { style: { background: '#111827', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 600 }, children: risk === 'secure' ? '🟢 Safe' : risk === 'caution' ? '🟡 Caution' : '🔴 Danger' }))] }), _jsx("div", { style: { marginTop: 4, color: '#555' }, children: "Your browsing is protected by AI." }), status && _jsx("div", { style: { color: '#666', marginBottom: 8 }, children: status }), analysis && (_jsxs(_Fragment, { children: [_jsxs("section", { style: { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }, children: [_jsx("h3", { children: "Site Trust" }), _jsxs("ul", { children: [_jsxs("li", { children: [_jsx("b", { children: "\uD83D\uDD17 Hostname" }), ": ", analysis.trust.hostname] }), _jsxs("li", { children: [_jsx("b", { children: "\uD83D\uDEE1\uFE0F Score" }), ": ", analysis.verdict?.score ?? 'N/A', "/100 ", analysis.verdict?.risk === 'secure' ? '🟢 Safe' : analysis.verdict?.risk === 'caution' ? '🟡 Caution' : '🔴 Danger'] }), _jsx("li", { children: analysis.trust.isHttps ? '🔒 Secure connection (HTTPS)' : '⚠️ Connection not secure (HTTP)' }), typeof analysis.trust.domainAgeDays === 'number' && (_jsxs("li", { children: ["\uD83C\uDF31 Domain age: ", analysis.trust.domainAgeDays, " day", analysis.trust.domainAgeDays === 1 ? '' : 's', analysis.trust.domainAgeDays < 30 ? ' → Newly registered' : ''] })), typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuer && (_jsxs("li", { children: ["\u26A0\uFE0F Certificate issued ", analysis.trust.certIssuedDaysAgo, " day", analysis.trust.certIssuedDaysAgo === 1 ? '' : 's', " ago (", analysis.trust.certIssuer, ")"] }))] }), risk === 'danger' && (() => {
                                const host = analysis.trust.hostname || '';
                                const fps = analysis.threats.fingerprintingSignals || [];
                                const showFp = fps.some(s => !/canvas\s*api\s*available/i.test(s));
                                const maybeBrand = /paypal/i.test(host) ? 'PayPal' : undefined;
                                return (_jsxs("div", { style: { background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: 8, color: '#7F1D1D' }, children: [_jsx("b", { children: "Why this may be dangerous" }), _jsxs("ul", { style: { marginTop: 6 }, children: [maybeBrand && _jsxs("li", { children: ["This site may be spoofing ", maybeBrand, ". Double\u2011check the URL for typos, extra characters, or unusual subdomains."] }), !maybeBrand && _jsx("li", { children: "This site may be impersonating a trusted brand. Verify the URL carefully." }), !analysis.trust.isHttps && _jsx("li", { children: "Site is not using HTTPS (data could be intercepted)." }), typeof analysis.trust.domainAgeDays === 'number' && analysis.trust.domainAgeDays < 30 && _jsx("li", { children: "Very new domain, which is a common trait in spoofing or scam sites." }), showFp && _jsxs("li", { children: ["Fingerprinting techniques detected: ", fps.slice(0, 5).join(', '), "."] }), analysis.threats.trackers.length > 5 && _jsx("li", { children: "Unusual number of trackers present which may indicate aggressive data collection." }), typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuedDaysAgo < 14 && _jsx("li", { children: "Recently issued TLS certificate; new certs on unknown domains can be risky." })] })] }));
                            })()] }), _jsxs("section", { style: { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }, children: [_jsx("h3", { children: "Cookies" }), (() => {
                                const siteInfo = new Set();
                                const cookies = new Set();
                                for (const f of analysis.consent.findings) {
                                    const txt = (f.text || '').trim();
                                    if (!txt)
                                        continue;
                                    const lower = `${f.kind || ''} ${txt}`.toLowerCase();
                                    if (lower.includes('cookie'))
                                        cookies.add(txt);
                                    else
                                        siteInfo.add(txt);
                                }
                                return (_jsxs("div", { children: [_jsx("div", { style: { color: '#444', marginBottom: 6 }, children: "Detected cookie-related and consent details collected from the page:" }), _jsxs("ul", { children: [siteInfo.size + cookies.size === 0 && _jsx("li", { children: "No cookie details detected yet." }), Array.from(new Set([...Array.from(siteInfo), ...Array.from(cookies)])).slice(0, 12).map((t, i) => (_jsx("li", { children: t }, i)))] })] }));
                            })(), _jsx("div", { style: { marginTop: 8 }, children: _jsx("button", { onClick: onSummarizeConsent, style: { background: '#2563eb', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }, children: "Summarize Consent" }) }), consentSummary && (_jsxs("div", { children: [_jsx("h4", { children: "Consent Summary" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }, children: consentSummary })] }))] }), _jsxs("section", { style: { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }, children: [_jsx("h3", { children: "Threats" }), _jsxs("ul", { children: [analysis.threats.trackers.length === 0 && _jsx("li", { children: "No trackers detected yet." }), analysis.threats.trackers.slice(0, 10).map((t, i) => (_jsxs("li", { children: [_jsx("b", { children: t.type }), " - ", t.domain] }, i))), analysis.threats.fingerprintingSignals.map((s, i) => (_jsxs("li", { children: [_jsx("b", { children: "fingerprint" }), " - ", s] }, i)))] }), _jsx("div", { style: { marginTop: 8 }, children: _jsx("button", { onClick: onExplainThreats, style: { background: '#16a34a', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }, children: "Explain Threats" }) }), threatsSummary && (_jsxs("div", { children: [_jsx("h4", { children: "Threats Explanation" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }, children: threatsSummary })] }))] }), _jsxs("section", { style: { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }, children: [_jsx("h3", { children: "Activity Log" }), _jsxs("ul", { style: { maxHeight: 160, overflow: 'auto', paddingRight: 8 }, children: [logs.length === 0 && _jsx("li", { children: "No events yet." }), logs.slice().reverse().slice(0, 20).map((l, i) => (_jsx("li", { style: { color: l.level === 'error' ? '#b71c1c' : l.level === 'warn' ? '#f57f17' : '#333' }, children: l.text }, i)))] })] }), _jsxs("section", { style: { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }, children: [_jsx("h3", { children: "Summaries" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { onClick: onSummarizePage, style: { background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }, children: "Summarize Page" }), _jsx("button", { onClick: onSummarizeSelection, style: { background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }, children: "Summarize Selection" })] }), aiStatus && (_jsxs("div", { style: { marginTop: 8, color: '#666' }, children: [_jsx("b", { children: "AI Status" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap' }, children: aiStatus })] })), pageSummary && (_jsxs("div", { children: [_jsx("h4", { children: "Page Summary" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }, children: pageSummary })] })), selectionSummary && (_jsxs("div", { children: [_jsx("h4", { children: "Selection Summary" }), _jsx("pre", { style: { whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }, children: selectionSummary })] }))] })] }))] }));
}
