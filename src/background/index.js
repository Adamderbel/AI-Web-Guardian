const analyses = new Map();
const redirectChains = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const whoisCache = new Map();
const certCache = new Map();
function cacheGet(map, key) {
    const e = map.get(key);
    if (!e)
        return undefined;
    if (Date.now() - e.ts > CACHE_TTL_MS) {
        map.delete(key);
        return undefined;
    }
    return e.data;
}
function cacheSet(map, key, data) {
    map.set(key, { data, ts: Date.now() });
}
chrome.runtime.onInstalled.addListener(() => {
    chrome.action.setBadgeBackgroundColor({ color: "#d32f2f" });
    chrome.action.setBadgeText({ text: "" });
});
// Side panel only via action click
chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id)
        return;
    await chrome.sidePanel.setOptions({ tabId: tab.id, path: "sidepanel.html", enabled: true });
    await chrome.sidePanel.open({ tabId: tab.id });
});
// Build redirect chain using webRequest
chrome.webRequest.onBeforeRedirect.addListener((details) => {
    if (details.tabId < 0)
        return;
    const chain = redirectChains.get(details.tabId) ?? [];
    chain.push({ from: details.url, to: details.redirectUrl || "", status: details.statusCode });
    redirectChains.set(details.tabId, chain);
}, { urls: ["https://*/*"] });
chrome.webRequest.onCompleted.addListener((details) => {
    // no-op; could finalize chain per navigation
}, { urls: ["https://*/*"], types: ["main_frame"] });
function classifyHostname(host) {
    const sensitive = ['paypal.com', 'amazon.com', 'google.com', 'microsoft.com', 'bank', 'wallet'];
    const lower = host.toLowerCase();
    const mimic = sensitive.find(s => lower.includes(s.replace('.com', '')));
    return mimic ? { spoofedLike: mimic.endsWith('.com') ? mimic : `${mimic}.com` } : {};
}
function makeVerdict(analysis) {
    const logs = [];
    // Start with 100 points and subtract based on findings
    let score = 100;
    const spoof = classifyHostname(analysis.trust.hostname);
    if (spoof.spoofedLike) {
        score -= 50; // Major penalty for spoofing
    }
    const age = analysis.trust.domainAgeDays;
    if (typeof age === 'number') {
        if (age < 7)
            score -= 40; // very new domain
        else if (age < 30)
            score -= 20; // new domain
    }
    if (!analysis.trust.isHttps) {
        score -= 30; // HTTP only
    }
    if (typeof analysis.trust.certIssuedDaysAgo === 'number' && analysis.trust.certIssuedDaysAgo < 7) {
        score -= 10; // very new certificate
    }
    // Trackers/fingerprinting only affect logs and a small score impact
    if (analysis.threats.trackers.length > 0) {
        score -= Math.min(10, analysis.threats.trackers.length);
        logs.push({ ts: Date.now(), level: 'info', text: `🕵️ ${analysis.threats.trackers.length} tracker(s) detected.`, tag: 'threat' });
    }
    if (analysis.threats.fingerprintingSignals.length > 0) {
        score -= 5;
        logs.push({ ts: Date.now(), level: 'info', text: '🕵️ Fingerprinting signals present.', tag: 'threat' });
    }
    score = Math.max(0, Math.min(100, score));
    let risk;
    if (score >= 90)
        risk = 'secure';
    else if (score >= 60)
        risk = 'caution';
    else
        risk = 'danger';
    const badgeText = risk === 'danger' ? '!' : (analysis.threats.trackers.length > 0 ? String(Math.min(analysis.threats.trackers.length, 99)) : '');
    return { risk, badgeText, logs, ...spoof, score };
}
function setBadgeByRisk(tabId, verdict) {
    const color = verdict.risk === 'danger' ? '#d32f2f' : verdict.risk === 'caution' ? '#f9a825' : '#2e7d32';
    chrome.action.setBadgeBackgroundColor({ tabId, color });
    chrome.action.setBadgeText({ tabId, text: verdict.badgeText || '' });
}
// Messaging router
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const tabId = sender.tab?.id ?? ("tabId" in msg ? msg.tabId : undefined);
    if (msg.type === "CONTENT/TRACKERS" && tabId != null) {
        const existing = analyses.get(tabId);
        const count = (msg.trackers?.length) || 0;
        if (existing) {
            existing.threats.trackers = msg.trackers;
            existing.verdict = makeVerdict(existing);
            analyses.set(tabId, existing);
            setBadgeByRisk(tabId, existing.verdict);
        }
    }
    if (msg.type === "CONTENT/CONSENT_FINDINGS" && tabId != null) {
        const existing = analyses.get(tabId);
        if (existing) {
            existing.consent.findings = msg.findings;
            existing.verdict = makeVerdict(existing);
            analyses.set(tabId, existing);
        }
    }
    if (msg.type === "CONTENT/FINGERPRINTING" && tabId != null) {
        const existing = analyses.get(tabId);
        if (existing) {
            existing.threats.fingerprintingSignals = msg.signals;
            existing.verdict = makeVerdict(existing);
            analyses.set(tabId, existing);
            const v = existing.verdict;
            setBadgeByRisk(tabId, v);
        }
    }
    if (msg.type === "CONTENT/REQUEST_ANALYSIS" && tabId != null) {
        // initialize record
        if (!analyses.has(tabId)) {
            analyses.set(tabId, {
                tabId,
                url: msg.url,
                trust: { isHttps: msg.url.startsWith("https://"), hostname: new URL(msg.url).hostname },
                consent: { findings: [] },
                threats: { trackers: [], fingerprintingSignals: [] },
                links: { redirectChain: redirectChains.get(tabId) ?? [] },
                summaries: {},
                verdict: makeVerdict({ tabId, url: msg.url, trust: { isHttps: msg.url.startsWith("https://"), hostname: new URL(msg.url).hostname }, consent: { findings: [] }, threats: { trackers: [], fingerprintingSignals: [] }, links: { redirectChain: redirectChains.get(tabId) ?? [] }, summaries: {} })
            });
        }
        const a = analyses.get(tabId);
        const v = makeVerdict(a);
        a.verdict = v;
        analyses.set(tabId, a);
        setBadgeByRisk(tabId, v);
        maybeEnrichTrust(tabId, a.url).catch(() => { });
    }
    if (msg.type === "PANEL/GET_ANALYSIS") {
        const targetTabId = tabId ?? -1;
        if (targetTabId >= 0) {
            const analysis = analyses.get(targetTabId);
            const out = analysis ? { type: "BG/ANALYSIS", analysis } : { type: "BG/STATUS", text: "No analysis yet. Interact with the page to start scanning." };
            sendResponse(out);
        }
    }
    if (msg.type === "PANEL/SUMMARIZE_PAGE" && tabId != null) {
        // Ask content to extract page text; summarization runs in side panel after user click
        chrome.tabs.sendMessage(tabId, { type: "BG/REQUEST_PAGE_TEXT" });
    }
    if (msg.type === "PANEL/SUMMARIZE_SELECTION" && tabId != null) {
        chrome.tabs.sendMessage(tabId, { type: "BG/REQUEST_SELECTION_TEXT" });
    }
    if (msg.type === 'PANEL/OPEN_SIDE_PANEL' && tabId != null) {
        chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true }).then(() => {
            chrome.sidePanel.open({ tabId });
        });
    }
    if (msg.type === 'PANEL/LANG_LOG' && tabId != null) {
        const a = analyses.get(tabId);
        if (a) {
            const entry = { ts: Date.now(), level: 'info', text: msg.text, tag: 'lang' };
            const verdict = (a.verdict ?? (a.verdict = { risk: 'secure', logs: [] }));
            verdict.logs.push(entry);
            analyses.set(tabId, a);
        }
    }
    // Only return true when you will respond asynchronously via sendResponse.
    // This handler responds synchronously above, so return false.
    return false;
});
// Open popup window when user clicks a trust notification
chrome.notifications?.onClicked?.addListener((notificationId) => {
    if (notificationId.startsWith('trust:')) {
        chrome.windows.create({ url: 'popup.html', type: 'popup', width: 380, height: 600 });
    }
});
// Hover preview request handling from content
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CONTENT/LINK_HOVER") {
        previewRedirect(msg.href).then((result) => {
            const out = { type: "BG/HOVER_PREVIEW", finalUrl: result.finalUrl, chain: result.chain, hoverVerdict: result.hoverVerdict, reason: result.reason };
            sendResponse(out);
        });
        return true;
    }
});
async function previewRedirect(href) {
    const chain = [];
    try {
        let current = href;
        for (let i = 0; i < 5; i++) {
            const res = await fetch(current, { redirect: "manual", method: "GET" });
            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get("location");
                if (!loc)
                    break;
                const next = new URL(loc, current).toString();
                chain.push({ from: current, to: next, status: res.status });
                current = next;
                continue;
            }
            const url = new URL(current);
            const host = url.hostname;
            const result = await classifyWithWhois(host);
            return { finalUrl: current, chain, hoverVerdict: result.verdict, reason: result.reason };
        }
        const url = new URL(current);
        const host = url.hostname;
        const result = await classifyWithWhois(host);
        return { finalUrl: current, chain, hoverVerdict: result.verdict, reason: result.reason };
    }
    catch {
        return { chain };
    }
}
async function maybeEnrichTrust(tabId, url) {
    try {
        const a = analyses.get(tabId);
        if (!a)
            return;
        const host = new URL(url).hostname;
        console.log(`[Enrichment] Starting for ${host}`);
        const cfg = await chrome.storage?.sync?.get?.(['whoisEndpoint', 'certEndpoint', 'useMockData']);
        // Built-in defaults: RDAP for WHOIS-like data, crt.sh for certs
        const whoisEndpoint = cfg?.whoisEndpoint || 'builtin:rdap';
        const certEndpoint = cfg?.certEndpoint || 'builtin:crtsh';
        const useMockData = cfg?.useMockData || false;
        let changed = false;
        // Mock data for testing (enable via chrome.storage.sync.set({ useMockData: true }))
        if (useMockData) {
            console.log('[Enrichment] Using mock data');
            a.trust.domainAgeDays = 8;
            a.trust.certIssuer = "Let's Encrypt";
            a.trust.certIssuedDaysAgo = 2;
            a.trust.certExpiry = new Date(Date.now() + 90 * 86400000).toISOString();
            changed = true;
        }
        else {
            // WHOIS via RDAP
            try {
                const cached = cacheGet(whoisCache, host);
                if (cached?.domainAgeDays !== undefined) {
                    console.log(`[Enrichment] WHOIS cache hit: ${cached.domainAgeDays} days`);
                    a.trust.domainAgeDays = cached.domainAgeDays;
                    changed = true;
                }
                else {
                    if (whoisEndpoint === 'builtin:rdap') {
                        console.log(`[Enrichment] Fetching WHOIS from RDAP for ${host}`);
                        const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`);
                        console.log(`[Enrichment] RDAP response status: ${res.status}`);
                        if (res.ok) {
                            const data = await res.json();
                            const events = Array.isArray(data?.events) ? data.events : [];
                            const created = events.find(e => (e.eventAction || '').includes('registration') || (e.eventAction || '').includes('creation'))?.eventDate
                                || data?.events?.find?.((e) => (e.eventAction || '').includes('registration'))?.eventDate;
                            if (created) {
                                const days = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
                                console.log(`[Enrichment] Domain age: ${days} days`);
                                a.trust.domainAgeDays = days;
                                cacheSet(whoisCache, host, { domainAgeDays: days });
                                changed = true;
                            }
                            else {
                                console.log('[Enrichment] No registration date found in RDAP response');
                            }
                        }
                    }
                    else if (whoisEndpoint) {
                        const res = await fetch(`${whoisEndpoint}?host=${encodeURIComponent(host)}`);
                        if (res.ok) {
                            const data = await res.json();
                            if (typeof data?.domainAgeDays === 'number') {
                                a.trust.domainAgeDays = data.domainAgeDays;
                                cacheSet(whoisCache, host, { domainAgeDays: data.domainAgeDays });
                                changed = true;
                            }
                        }
                    }
                }
            }
            catch (e) {
                console.error('[Enrichment] WHOIS error:', e);
            }
            // Certificate via crt.sh
            try {
                const cached = cacheGet(certCache, host);
                if (cached) {
                    console.log(`[Enrichment] Cert cache hit: ${cached.issuer}`);
                    a.trust.certIssuer = cached.issuer;
                    a.trust.certExpiry = cached.notAfter;
                    a.trust.certIssuedDaysAgo = cached.issuedDaysAgo;
                    changed = true;
                }
                else {
                    if (certEndpoint === 'builtin:crtsh') {
                        console.log(`[Enrichment] Fetching cert from crt.sh for ${host}`);
                        const res = await fetch(`https://crt.sh/?q=${encodeURIComponent(host)}&output=json`);
                        console.log(`[Enrichment] crt.sh response status: ${res.status}`);
                        if (res.ok) {
                            const arr = await res.json();
                            if (Array.isArray(arr) && arr.length > 0) {
                                // Take latest by not_before
                                const latest = arr.slice().sort((a, b) => new Date(b.not_before).getTime() - new Date(a.not_before).getTime())[0];
                                const issuer = latest.issuer_name || latest.issuer_ca_id || 'Unknown';
                                const notAfter = latest.not_after ? new Date(latest.not_after).toISOString() : undefined;
                                const issuedDaysAgo = latest.not_before ? Math.floor((Date.now() - new Date(latest.not_before).getTime()) / 86400000) : undefined;
                                console.log(`[Enrichment] Cert issuer: ${issuer}, issued ${issuedDaysAgo} days ago`);
                                a.trust.certIssuer = issuer;
                                if (notAfter)
                                    a.trust.certExpiry = notAfter;
                                if (issuedDaysAgo !== undefined)
                                    a.trust.certIssuedDaysAgo = issuedDaysAgo;
                                cacheSet(certCache, host, { issuer, notAfter, issuedDaysAgo });
                                changed = true;
                            }
                            else {
                                console.log('[Enrichment] No certificates found in crt.sh response');
                            }
                        }
                    }
                    else if (certEndpoint) {
                        const res = await fetch(`${certEndpoint}?host=${encodeURIComponent(host)}`);
                        if (res.ok) {
                            const data = await res.json();
                            const issuer = typeof data?.issuer === 'string' ? data.issuer : undefined;
                            const notAfter = typeof data?.notAfter === 'string' ? data.notAfter : undefined;
                            const issuedDaysAgo = typeof data?.issuedDaysAgo === 'number' ? data.issuedDaysAgo : undefined;
                            if (issuer)
                                a.trust.certIssuer = issuer;
                            if (notAfter)
                                a.trust.certExpiry = notAfter;
                            if (issuedDaysAgo !== undefined)
                                a.trust.certIssuedDaysAgo = issuedDaysAgo;
                            cacheSet(certCache, host, { issuer, notAfter, issuedDaysAgo });
                            changed = true;
                        }
                    }
                }
            }
            catch (e) {
                console.error('[Enrichment] Cert error:', e);
            }
        }
        if (changed) {
            console.log('[Enrichment] Data changed, updating verdict and notifying panel');
            a.verdict = makeVerdict(a);
            analyses.set(tabId, a);
            setBadgeByRisk(tabId, a.verdict);
            // Notify panel to refresh
            try {
                chrome.runtime.sendMessage({ type: 'BG/ANALYSIS', analysis: a });
            }
            catch { }
        }
        else {
            console.log('[Enrichment] No changes made');
        }
    }
    catch (e) {
        console.error('[Enrichment] Fatal error:', e);
    }
}
async function classifyWithWhois(host) {
    const spoof = classifyHostname(host);
    if (spoof.spoofedLike)
        return { verdict: 'danger', reason: `Possible spoof of ${spoof.spoofedLike}` };
    try {
        const cfg = await chrome.storage?.sync?.get?.(['whoisEndpoint']);
        const whoisEndpoint = cfg?.whoisEndpoint || 'builtin:rdap';
        let age = cacheGet(whoisCache, host)?.domainAgeDays;
        if (age === undefined) {
            if (whoisEndpoint === 'builtin:rdap') {
                const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(host)}`);
                if (res.ok) {
                    const data = await res.json();
                    const events = Array.isArray(data?.events) ? data.events : [];
                    const created = events.find(e => (e.eventAction || '').includes('registration') || (e.eventAction || '').includes('creation'))?.eventDate
                        || data?.events?.find?.((e) => (e.eventAction || '').includes('registration'))?.eventDate;
                    if (created) {
                        age = Math.floor((Date.now() - new Date(created).getTime()) / 86400000);
                        cacheSet(whoisCache, host, { domainAgeDays: age });
                    }
                }
            }
            else {
                const res = await fetch(`${whoisEndpoint}?host=${encodeURIComponent(host)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (typeof data?.domainAgeDays === 'number') {
                        age = data.domainAgeDays;
                        cacheSet(whoisCache, host, { domainAgeDays: age });
                    }
                }
            }
        }
        if (typeof age === 'number' && age < 30)
            return { verdict: 'suspicious', reason: 'Newly registered domain (<30 days)' };
    }
    catch { }
    return { verdict: 'safe', reason: 'Safe' };
}
export {};
//
