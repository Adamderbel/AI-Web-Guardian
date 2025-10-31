import trackers from "@shared/trackers.json";
// Simple state
const findings = [];
const trackerHits = [];
const fingerprintSignals = [];
function send(msg) {
    chrome.runtime.sendMessage(msg);
}
function initAnalysis() {
    send({ type: "CONTENT/REQUEST_ANALYSIS", tabId: getTabId(), url: location.href });
}
function getTabId() {
    // Content scripts do not have tabId directly; background fills it from sender.
    // We pass a placeholder; background uses sender.tab.id.
    return -1;
}
function scanConsent() {
    // Cookie banner heuristic (simple and conservative)
    const textMatches = ["cookie", "consent", "agree", "gdpr", "privacy"];
    const banners = [];
    const all = Array.from(document.querySelectorAll('body *'));
    for (const el of all) {
        const txt = (el.innerText || "").toLowerCase();
        if (!txt || txt.length < 10)
            continue;
        if (textMatches.some((t) => txt.includes(t))) {
            // heuristic: visible and positioned near bottom or fixed
            const cs = getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const nearBottom = rect.top > window.innerHeight * 0.6;
            if (cs.display !== "none" && cs.visibility !== "hidden" && (nearBottom || cs.position === "fixed")) {
                banners.push(el);
            }
        }
        if (banners.length > 3)
            break;
    }
    const prechecked = Array.from(document.querySelectorAll('input[type="checkbox"][checked]'));
    for (const c of prechecked) {
        findings.push({ kind: "prechecked", selector: cssPath(c) });
    }
    for (const b of banners) {
        findings.push({ kind: "banner", text: b.innerText.slice(0, 200), selector: cssPath(b) });
    }
    // Hidden opt-outs
    const possibleOptOut = Array.from(document.querySelectorAll('a,button,input'))
        .filter((el) => /opt[- ]?out|reject|decline/i.test(el.innerText || el.value || ""));
    for (const el of possibleOptOut) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) < 0.1) {
            findings.push({ kind: "hidden-optout", text: el.innerText || el.value, selector: cssPath(el) });
        }
    }
    if (findings.length) {
        send({ type: "CONTENT/CONSENT_FINDINGS", tabId: getTabId(), findings });
    }
}
function scanTrackers() {
    const srcs = Array.from(document.scripts)
        .map((s) => s.src)
        .filter(Boolean);
    const hosts = srcs.map((u) => {
        try {
            return new URL(u).hostname;
        }
        catch {
            return "";
        }
    }).filter(Boolean);
    for (const h of hosts) {
        const hit = trackers.find(t => h.endsWith(t.domain));
        if (hit) {
            trackerHits.push({ url: `https://${h}`, domain: hit.domain, type: hit.type });
        }
    }
    // Simple fingerprinting heuristics
    if (window.FingerprintJS || srcs.some(s => /fingerprint/i.test(s))) {
        fingerprintSignals.push("fingerprintjs detected");
    }
    const canvas = HTMLCanvasElement.prototype?.toDataURL;
    if (canvas) {
        // heuristic marker
        fingerprintSignals.push("canvas API available (heuristic)");
    }
    if (trackerHits.length)
        send({ type: "CONTENT/TRACKERS", tabId: getTabId(), trackers: trackerHits });
    if (fingerprintSignals.length)
        send({ type: "CONTENT/FINGERPRINTING", tabId: getTabId(), signals: fingerprintSignals });
}
function setupLinkHoverPreview() {
    let tooltip = null;
    function ensureTooltip() {
        if (!tooltip) {
            tooltip = document.createElement('div');
            tooltip.style.position = 'fixed';
            tooltip.style.zIndex = '2147483647';
            tooltip.style.background = '#111';
            tooltip.style.color = '#fff';
            tooltip.style.padding = '6px 8px';
            tooltip.style.borderRadius = '6px';
            tooltip.style.fontSize = '12px';
            tooltip.style.pointerEvents = 'none';
            tooltip.style.maxWidth = '60vw';
            tooltip.style.whiteSpace = 'nowrap';
            document.body.appendChild(tooltip);
        }
        return tooltip;
    }
    document.addEventListener('mousemove', (e) => {
        if (tooltip) {
            tooltip.style.left = `${e.clientX + 12}px`;
            tooltip.style.top = `${e.clientY + 12}px`;
        }
    });
    document.addEventListener('mouseover', (e) => {
        const a = e.target.closest('a[href]');
        if (!a)
            return;
        const t = ensureTooltip();
        t.textContent = a.href;
        chrome.runtime.sendMessage({ type: 'CONTENT/LINK_HOVER', tabId: getTabId(), href: a.href }, (resp) => {
            if (!resp)
                return;
            const finalUrl = resp.finalUrl || a.href;
            const verdict = resp.hoverVerdict;
            const reason = resp.reason || '';
            let prefix = '↪︎';
            let label = '';
            let bg = '#111';
            let color = '#fff';
            if (verdict === 'danger') {
                label = '⚠️ Dangerous';
                bg = '#b71c1c';
            }
            else if (verdict === 'suspicious') {
                label = '⚠️ Suspicious';
                bg = '#f57f17';
                color = '#000';
            }
            else {
                label = '✅ Safe';
                bg = '#1b5e20';
            }
            t.style.background = bg;
            t.style.color = color;
            t.textContent = `${prefix} Redirects to: ${finalUrl} — ${label}${reason ? ` (${reason})` : ''}`;
        });
    });
    document.addEventListener('mouseout', (e) => {
        const a = e.target.closest('a[href]');
        if (a && tooltip) {
            tooltip.remove();
            tooltip = null;
        }
    });
}
// Handlers to provide page/selection text on request
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'BG/REQUEST_PAGE_TEXT') {
        const text = extractPageText();
        chrome.runtime.sendMessage({ type: 'CONTENT/PAGE_TEXT', text });
    }
    if (msg?.type === 'BG/REQUEST_SELECTION_TEXT') {
        const sel = window.getSelection()?.toString() || '';
        chrome.runtime.sendMessage({ type: 'CONTENT/SELECTION_TEXT', text: sel });
    }
});
function extractPageText() {
    const article = document.querySelector('article');
    const main = document.querySelector('main');
    const bodyText = document.body?.innerText || '';
    return (article?.textContent || main?.textContent || bodyText || '').trim();
}
function cssPath(el) {
    if (!(el instanceof Element))
        return '';
    const path = [];
    while (el && el.nodeType === Node.ELEMENT_NODE) {
        let selector = el.nodeName.toLowerCase();
        if (el.id) {
            selector += `#${el.id}`;
            path.unshift(selector);
            break;
        }
        else {
            let sib = el;
            let nth = 1;
            while ((sib = sib.previousElementSibling)) {
                if (sib.nodeName.toLowerCase() === selector)
                    nth++;
            }
            selector += `:nth-of-type(${nth})`;
        }
        path.unshift(selector);
        el = el.parentElement;
    }
    return path.join(' > ');
}
(function main() {
    initAnalysis();
    scanConsent();
    scanTrackers();
    setupLinkHoverPreview();
})();
