import React, { useEffect, useMemo, useState } from 'react';
import type { PageAnalysis, MsgFromPanel, MsgToPanel } from '@shared/messages';

export default function PopupApp() {
  const [tabId, setTabId] = useState<number | null>(null);
  const [status, setStatus] = useState<string>('Loading…');
  const [analysis, setAnalysis] = useState<PageAnalysis | null>(null);

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs[0];
      if (t?.id != null) {
        setTabId(t.id);
        requestAnalysis(t.id);
      } else {
        setStatus('No active tab');
      }
    });
  }, []);

  async function requestAnalysis(tid: number) {
    try {
      const req: MsgFromPanel = { type: 'PANEL/GET_ANALYSIS', tabId: tid } as any;
      const resp = await chrome.runtime.sendMessage(req as any) as MsgToPanel;
      if (resp?.type === 'BG/ANALYSIS') {
        setAnalysis(resp.analysis);
        setStatus('');
      } else if (resp?.type === 'BG/STATUS') {
        setStatus(resp.text);
      }
    } catch (e) {
      setStatus(String(e));
    }
  }

  const risk = analysis?.verdict?.risk || 'secure';
  const riskLabel = risk === 'secure' ? 'safe' : risk;
  const logs = analysis?.verdict?.logs || [];

  const onOpenDetails = async () => {
    if (!tabId) return;
    await chrome.runtime.sendMessage({ type: 'PANEL/OPEN_SIDE_PANEL', tabId } as MsgFromPanel as any);
    window.close();
  };

  const trustScore = useMemo(() => analysis?.verdict?.score ?? '—', [analysis]);

  return (
    <div style={{ fontFamily: 'Inter, system-ui, Arial', padding: 12, width: 320 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>AI Web Guardian</h3>
        {analysis && (
          <div style={{ background: '#111827', color: '#fff', borderRadius: 8, padding: '4px 8px', fontWeight: 600, fontSize: 12 }}>
            {risk === 'secure' ? '🟢 Safe' : risk === 'caution' ? '🟡 Caution' : '🔴 Danger'}
          </div>
        )}
      </div>
      {status && <div style={{ color: '#666', marginBottom: 8 }}>{status}</div>}

      {analysis && (
        <>
          <section style={{ marginBottom: 8 }}>
            <div style={{ color: '#333' }}><b>🔗 Hostname</b>: {analysis.trust.hostname}</div>
            <div style={{ color: '#333' }}><b>🛡️ Score</b>: {trustScore}</div>
            {typeof analysis.trust.domainAgeDays === 'number' && (
              <div style={{ color: '#333' }}>
                🌱 Domain age: {analysis.trust.domainAgeDays} day{analysis.trust.domainAgeDays===1?'':'s'}{analysis.trust.domainAgeDays < 30 ? ' → Newly registered' : ''}
              </div>
            )}
            {typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuer && (
              <div style={{ color: '#333' }}>
                ⚠️ Certificate issued {analysis.trust.certIssuedDaysAgo} day{analysis.trust.certIssuedDaysAgo===1?'':'s'} ago ({analysis.trust.certIssuer})
              </div>
            )}
          </section>

          <section>
            <h4 style={{ margin: '8px 0 4px' }}>Recent Activity</h4>
            <ul style={{ maxHeight: 120, overflow: 'auto', paddingRight: 6, margin: 0, paddingLeft: 18 }}>
              {logs.length === 0 && <li>No events yet.</li>}
              {logs.slice().reverse().slice(0, 8).map((l, i) => (
                <li key={i} style={{ color: l.level === 'error' ? '#b71c1c' : l.level === 'warn' ? '#f57f17' : '#333' }}>{l.text}</li>
              ))}
            </ul>
          </section>

        </>
      )}
    </div>
  );
}
