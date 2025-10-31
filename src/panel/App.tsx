import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { MsgFromPanel, MsgToPanel, PageAnalysis } from '@shared/messages';
import { summarizeText, detectLanguage } from '@shared/ai';

export default function App() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('Loading...');
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);
  const [pageText, setPageText] = useState<string>('');
  const [selectionText, setSelectionText] = useState<string>('');
  const pageTextRef = useRef<string>('');
  const selectionTextRef = useRef<string>('');
  const [pageSummary, setPageSummary] = useState<string>('');
  const [selectionSummary, setSelectionSummary] = useState<string>('');
  const [consentSummary, setConsentSummary] = useState<string>('');
  const [threatsSummary, setThreatsSummary] = useState<string>('');
  const [logs, setLogs] = useState<Array<{ ts: number; level: 'info'|'warn'|'error'; text: string; tag?: string }>>([]);
  const [aiStatus, setAiStatus] = useState<string>('');
  const [isSummarizing, setIsSummarizing] = useState<boolean>(false);
  const isSummarizingRef = useRef<boolean>(false);
  useEffect(() => { isSummarizingRef.current = isSummarizing; }, [isSummarizing]);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs[0];
      if (t?.id != null) {
        setTabId(t.id);
        requestAnalysis(t.id);
      }
    });

    const onMsg = (msg: any) => {
      if (msg?.type === 'BG/ANALYSIS') {
        setAnalysis(msg.analysis);
        setStatus('');
      }
      if (msg?.type === 'BG/STATUS') setStatus(msg.text);
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
      const g: any = globalThis as any;
      const Summ = g.ai?.summarizer ?? g.Summarizer;
      const Detect = g.ai?.languageDetector ?? g.LanguageDetector;
      const sumAvail = Summ?.availability ? await Summ.availability() : 'missing';
      const detAvail = Detect?.availability ? await Detect.availability() : 'missing';
      // Do not override in-progress messages
      if (!cancelled && !isSummarizingRef.current) setAiStatus(`AI status → Summarizer: ${String(sumAvail)} | Detector: ${String(detAvail)}`);
    };
    // Initial probe + poll up to ~30s (every 2s)
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      await poll();
      if (tries >= 15) clearInterval(id);
    }, 2000);
    poll();
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  async function requestAnalysis(tabId: number) {
    const req: MsgFromPanel = { type: 'PANEL/GET_ANALYSIS', tabId };
    const resp = await chrome.runtime.sendMessage(req as any) as MsgToPanel;
    if (resp?.type === 'BG/ANALYSIS') {
      setAnalysis(resp.analysis);
      setStatus('');
      setLogs(resp.analysis.verdict?.logs || []);
    } else if (resp?.type === 'BG/STATUS') setStatus(resp.text);
  }

  async function onSummarizePage() {
    if (!tabId) return;
    await chrome.runtime.sendMessage({ type: 'PANEL/SUMMARIZE_PAGE', tabId } as MsgFromPanel as any);
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
    if (!tabId) return;
    await chrome.runtime.sendMessage({ type: 'PANEL/SUMMARIZE_SELECTION', tabId } as MsgFromPanel as any);
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
    if (!analysis) return;
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
    if (!analysis) return;
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

  async function summarizeWithLanguage(text: string, detectionText?: string): Promise<string | null> {
    setIsSummarizing(true);
    try {
      const det = await detectLanguage((detectionText ?? text));
      let working = text;
      let note = '';

      const normalizeCode = (c?: string) => {
        if (!c) return undefined;
        const lower = c.toLowerCase();
        // Treat 'root' as English from some detectors
        if (lower === 'root') return 'en';
        // Take primary subtag (e.g., es-es -> es)
        const base = lower.split(/[-_]/)[0];
        return base || lower;
      };

      const getLanguageName = (code?: string) => {
        const base = normalizeCode(code);
        const fallbackMap: Record<string, string> = {
          en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', ja: 'Japanese',
          zh: 'Chinese', ru: 'Russian', ar: 'Arabic', hi: 'Hindi', nl: 'Dutch', sv: 'Swedish', no: 'Norwegian', da: 'Danish',
          fi: 'Finnish', ko: 'Korean', pl: 'Polish', tr: 'Turkish', uk: 'Ukrainian', el: 'Greek', he: 'Hebrew', ro: 'Romanian',
          cs: 'Czech', sk: 'Slovak', hu: 'Hungarian', id: 'Indonesian', ms: 'Malay', th: 'Thai', vi: 'Vietnamese'
        };
        // Prefer base normalization first (so 'root' -> 'en' -> 'English')
        if (base && fallbackMap[base]) return fallbackMap[base];
        try {
          const dn: any = (globalThis as any).Intl?.DisplayNames ? new (Intl as any).DisplayNames(['en'], { type: 'language' }) : null;
          if (dn) {
            if (base) {
              const byBase = dn.of(base);
              if (byBase && typeof byBase === 'string') return byBase[0].toUpperCase() + byBase.slice(1);
            }
            if (code) {
              const byCode = dn.of(code);
              if (byCode && typeof byCode === 'string') return byCode[0].toUpperCase() + byCode.slice(1);
            }
          }
        } catch {}
        if (code) return (code === 'root' ? 'English' : code.toUpperCase());
        return 'Unknown';
      };

      const langLabel = getLanguageName(det?.code);

      if (det?.code && normalizeCode(det.code) !== 'en') {
        setAiStatus(`🌐 ${langLabel} detected\n🧠 Summarizing original content (translation skipped)`);
        note = `(Original language: ${langLabel})\n\n`;
        await chrome.runtime.sendMessage({ type: 'PANEL/LANG_LOG', text: `🌐 ${langLabel} detected` } as MsgFromPanel as any);
      } else if (normalizeCode(det?.code) === 'en') {
        setAiStatus('🌐 English detected\n🧠 Summarizing original content (translation skipped)');
      } else {
        setAiStatus('🌐 Unknown language detected\n🧠 Summarizing original content (translation skipped)');
      }

      const s = await summarizeText(working);
      if (!s) {
        setAiStatus('Summarizer unavailable. If models are still downloading, retry shortly.');
        return null;
      }
      setAiStatus('✅ Summary ready');
      return `${note}${s}`;
    } finally {
      setIsSummarizing(false);
    }
  }

  const trustScore = useMemo(() => {
    if (!analysis) return '—';
    let score = 100;
    if (!analysis.trust.isHttps) score -= 40;
    if (analysis.threats.trackers.length > 0) score -= Math.min(analysis.threats.trackers.length * 3, 30);
    if (analysis.threats.fingerprintingSignals.length > 0) score -= 10;
    return Math.max(0, score);
  }, [analysis]);

  const risk = analysis?.verdict?.risk || 'secure';
  const riskLabel = risk === 'secure' ? 'safe' : risk;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial', padding: 14, width: 440, background: '#fafafa', border: '1px solid #eee', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ marginTop: 0, fontSize: 18 }}>AI Web Guardian</h2>
        {analysis && (
          <div style={{ background: '#111827', color: '#fff', borderRadius: 8, padding: '6px 10px', fontWeight: 600 }}>
            {risk === 'secure' ? '🟢 Safe' : risk === 'caution' ? '🟡 Caution' : '🔴 Danger'}
          </div>
        )}
      </div>
      <div style={{ marginTop: 4, color: '#555' }}>Your browsing is protected by AI.</div>

      {status && <div style={{ color: '#666', marginBottom: 8 }}>{status}</div>}

      {analysis && (
        <>
          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <h3>Site Trust</h3>
            <ul>
              <li><b>🔗 Hostname</b>: {analysis.trust.hostname}</li>
              <li><b>🛡️ Score</b>: {analysis.verdict?.score ?? 'N/A'}/100 {analysis.verdict?.risk === 'secure' ? '🟢 Safe' : analysis.verdict?.risk === 'caution' ? '🟡 Caution' : '🔴 Danger'}</li>
              <li>{analysis.trust.isHttps ? '🔒 Secure connection (HTTPS)' : '⚠️ Connection not secure (HTTP)'}</li>
              {typeof analysis.trust.domainAgeDays === 'number' && (
                <li>🌱 Domain age: {analysis.trust.domainAgeDays} day{analysis.trust.domainAgeDays===1?'':'s'}{analysis.trust.domainAgeDays < 30 ? ' → Newly registered' : ''}</li>
              )}
              {typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuer && (
                <li>⚠️ Certificate issued {analysis.trust.certIssuedDaysAgo} day{analysis.trust.certIssuedDaysAgo===1?'':'s'} ago ({analysis.trust.certIssuer})</li>
              )}
            </ul>
            {risk === 'danger' && (() => {
              const host = analysis.trust.hostname || '';
              const fps = analysis.threats.fingerprintingSignals || [];
              const showFp = fps.some(s => !/canvas\s*api\s*available/i.test(s));
              const maybeBrand = /paypal/i.test(host) ? 'PayPal' : undefined;
              return (
                <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 6, padding: 8, color: '#7F1D1D' }}>
                  <b>Why this may be dangerous</b>
                  <ul style={{ marginTop: 6 }}>
                    {maybeBrand && <li>This site may be spoofing {maybeBrand}. Double‑check the URL for typos, extra characters, or unusual subdomains.</li>}
                    {!maybeBrand && <li>This site may be impersonating a trusted brand. Verify the URL carefully.</li>}
                    {!analysis.trust.isHttps && <li>Site is not using HTTPS (data could be intercepted).</li>}
                    {typeof analysis.trust.domainAgeDays === 'number' && analysis.trust.domainAgeDays < 30 && <li>Very new domain, which is a common trait in spoofing or scam sites.</li>}
                    {showFp && <li>Fingerprinting techniques detected: {fps.slice(0,5).join(', ')}.</li>}
                    {analysis.threats.trackers.length > 5 && <li>Unusual number of trackers present which may indicate aggressive data collection.</li>}
                    {typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuedDaysAgo < 14 && <li>Recently issued TLS certificate; new certs on unknown domains can be risky.</li>}
                  </ul>
                </div>
              );
            })()}
          </section>

          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <h3>Cookies</h3>
            {(() => {
              const siteInfo = new Set<string>();
              const cookies = new Set<string>();
              for (const f of analysis.consent.findings) {
                const txt = (f.text || '').trim();
                if (!txt) continue;
                const lower = `${f.kind || ''} ${txt}`.toLowerCase();
                if (lower.includes('cookie')) cookies.add(txt);
                else siteInfo.add(txt);
              }
              return (
                <div>
                  <div style={{ color: '#444', marginBottom: 6 }}>
                    Detected cookie-related and consent details collected from the page:
                  </div>
                  <ul>
                    {siteInfo.size + cookies.size === 0 && <li>No cookie details detected yet.</li>}
                    {Array.from(new Set([ ...Array.from(siteInfo), ...Array.from(cookies) ])).slice(0, 12).map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              );
            })()}
            <div style={{ marginTop: 8 }}>
              <button onClick={onSummarizeConsent} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Summarize Consent</button>
            </div>
            {consentSummary && (
              <div>
                <h4>Consent Summary</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>{consentSummary}</pre>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <h3>Threats</h3>
            <ul>
              {analysis.threats.trackers.length === 0 && <li>No trackers detected yet.</li>}
              {analysis.threats.trackers.slice(0, 10).map((t, i) => (
                <li key={i}><b>{t.type}</b> - {t.domain}</li>
              ))}
              {analysis.threats.fingerprintingSignals.map((s, i) => (
                <li key={i}><b>fingerprint</b> - {s}</li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <button onClick={onExplainThreats} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Explain Threats</button>
            </div>
            {threatsSummary && (
              <div>
                <h4>Threats Explanation</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>{threatsSummary}</pre>
              </div>
            )}
          </section>

          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <h3>Activity Log</h3>
            <ul style={{ maxHeight: 160, overflow: 'auto', paddingRight: 8 }}>
              {logs.length === 0 && <li>No events yet.</li>}
              {logs.slice().reverse().slice(0, 20).map((l, i) => (
                <li key={i} style={{ color: l.level === 'error' ? '#b71c1c' : l.level === 'warn' ? '#f57f17' : '#333' }}>{l.text}</li>
              ))}
            </ul>
          </section>

          <section style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 12, marginBottom: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
            <h3>Summaries</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onSummarizePage} style={{ background: '#7c3aed', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Summarize Page</button>
              <button onClick={onSummarizeSelection} style={{ background: '#0ea5e9', color: '#fff', border: 'none', padding: '8px 10px', borderRadius: 6, cursor: 'pointer' }}>Summarize Selection</button>
            </div>
            {aiStatus && (
              <div style={{ marginTop: 8, color: '#666' }}>
                <b>AI Status</b>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{aiStatus}</pre>
              </div>
            )}
            {pageSummary && (
              <div>
                <h4>Page Summary</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>{pageSummary}</pre>
              </div>
            )}
            {selectionSummary && (
              <div>
                <h4>Selection Summary</h4>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px', lineHeight: '1.6', background: '#f9fafb', padding: 8, borderRadius: 6, border: '1px solid #eee' }}>{selectionSummary}</pre>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
