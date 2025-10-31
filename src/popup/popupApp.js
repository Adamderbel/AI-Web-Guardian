import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
export default function PopupApp() {
    const [tabId, setTabId] = useState(null);
    const [status, setStatus] = useState('Loading…');
    const [analysis, setAnalysis] = useState(null);
    useEffect(() => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const t = tabs[0];
            if (t?.id != null) {
                setTabId(t.id);
                requestAnalysis(t.id);
            }
            else {
                setStatus('No active tab');
            }
        });
    }, []);
    async function requestAnalysis(tid) {
        try {
            const req = { type: 'PANEL/GET_ANALYSIS', tabId: tid };
            const resp = await chrome.runtime.sendMessage(req);
            if (resp?.type === 'BG/ANALYSIS') {
                setAnalysis(resp.analysis);
                setStatus('');
            }
            else if (resp?.type === 'BG/STATUS') {
                setStatus(resp.text);
            }
        }
        catch (e) {
            setStatus(String(e));
        }
    }
    const risk = analysis?.verdict?.risk || 'secure';
    const riskLabel = risk === 'secure' ? 'safe' : risk;
    const logs = analysis?.verdict?.logs || [];
    const onOpenDetails = async () => {
        if (!tabId)
            return;
        await chrome.runtime.sendMessage({ type: 'PANEL/OPEN_SIDE_PANEL', tabId });
        window.close();
    };
    const trustScore = useMemo(() => analysis?.verdict?.score ?? '—', [analysis]);
    return (_jsxs("div", { style: { fontFamily: 'Inter, system-ui, Arial', padding: 12, width: 320 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }, children: [_jsx("h3", { style: { margin: 0 }, children: "AI Web Guardian" }), analysis && (_jsx("div", { style: { background: '#111827', color: '#fff', borderRadius: 8, padding: '4px 8px', fontWeight: 600, fontSize: 12 }, children: risk === 'secure' ? '🟢 Safe' : risk === 'caution' ? '🟡 Caution' : '🔴 Danger' }))] }), status && _jsx("div", { style: { color: '#666', marginBottom: 8 }, children: status }), analysis && (_jsxs(_Fragment, { children: [_jsxs("section", { style: { marginBottom: 8 }, children: [_jsxs("div", { style: { color: '#333' }, children: [_jsx("b", { children: "\uD83D\uDD17 Hostname" }), ": ", analysis.trust.hostname] }), _jsxs("div", { style: { color: '#333' }, children: [_jsx("b", { children: "\uD83D\uDEE1\uFE0F Score" }), ": ", trustScore] }), typeof analysis.trust.domainAgeDays === 'number' && (_jsxs("div", { style: { color: '#333' }, children: ["\uD83C\uDF31 Domain age: ", analysis.trust.domainAgeDays, " day", analysis.trust.domainAgeDays === 1 ? '' : 's', analysis.trust.domainAgeDays < 30 ? ' → Newly registered' : ''] })), typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuer && (_jsxs("div", { style: { color: '#333' }, children: ["\u26A0\uFE0F Certificate issued ", analysis.trust.certIssuedDaysAgo, " day", analysis.trust.certIssuedDaysAgo === 1 ? '' : 's', " ago (", analysis.trust.certIssuer, ")"] }))] }), _jsxs("section", { children: [_jsx("h4", { style: { margin: '8px 0 4px' }, children: "Recent Activity" }), _jsxs("ul", { style: { maxHeight: 120, overflow: 'auto', paddingRight: 6, margin: 0, paddingLeft: 18 }, children: [logs.length === 0 && _jsx("li", { children: "No events yet." }), logs.slice().reverse().slice(0, 8).map((l, i) => (_jsx("li", { style: { color: l.level === 'error' ? '#b71c1c' : l.level === 'warn' ? '#f57f17' : '#333' }, children: l.text }, i)))] })] })] }))] }));
}
