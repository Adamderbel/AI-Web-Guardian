# 🧠 AI Web Guardian

**AI Web Guardian** is a Chrome MV3 extension (built with **React + TypeScript + Vite**) that protects users in real time while browsing.  
It analyzes every site you visit — from **trustworthiness** and **cookie consent traps** to **hidden trackers** and **unsafe links** — and uses **Chrome’s on-device AI APIs** to provide clear, human-readable insights and summaries.

---

## 🚀 Problem Statement

"Modern websites often hide security risks behind complex layers — misleading cookie banners, hidden trackers, spoofed domains, or walls of unreadable policies.  
Most users **don’t know what data they’re really sharing**, or whether a website can be trusted.

AI Web Guardian combines lightweight, on‑page analysis (HTTPS/cert/domain checks, consent scanning, tracker heuristics, link redirects) with Chrome’s on‑device AI summarizer to turn long, dense pages and consent text into short, privacy‑preserving insights — instantly and without sending content to any server.

---

## 🔍 What It Does (Key Features)

### 1. 🛡️ Trust & Authenticity
- Checks for **SSL/HTTPS** and **certificate validity**.
- Detects **domain impersonation** (e.g., `paypa1.com` vs `paypal.com`).
- Fetches **domain age** via **RDAP** and certificate info from **crt.sh**.
- Assigns a simple **risk score** and displays a colored badge (🟢 Safe / 🟡 Caution / 🔴 Danger).

### 2. 🍪 Cookies & Consent
- Detects **cookie banners**, **pre‑checked boxes**, and **hidden opt‑outs**.
- On demand, uses the **AI Summarizer** to condense long consent/policy text into a few clear bullet points.

### 3. 🕵️ Hidden Threats
- Scans for **known trackers** and **third‑party scripts** (via `@shared/trackers.json`).
- Flags **fingerprinting signals** (e.g., FingerprintJS) and other aggressive collection hints.
- On demand, the **AI Summarizer** explains what these findings mean for privacy and give a recommended actions in a few plain‑English bullets.

### 4. 🔗 Link Safety
- When hovering a link, shows a **real‑time preview** of the **final redirect destination**.
- Provides a quick heuristic verdict (safe/suspicious/danger) based on redirect chain and domain age.
- Warns about possible phishing or ad redirects.

### 5. 💬 AI Summaries (On‑device)
- Uses Chrome’s on‑device **Summarizer API** to summarize:
  - The **entire webpage** or **selected text** (on demand in the side panel).
  - **Consent/policy** text into plain English.
  - **Threats** text into plain English.
- Uses **Language Detection API** to identify the text’s language.
- Runs locally (no network calls) — the summarized text stays in the browser.

---

## 🧩 Technology Stack

- **Frontend:** React (Vite + TypeScript)
- **Browser API:** Chrome Manifest V3, Side Panel API, WebRequest API
- **AI APIs (Chrome on‑device):**
  - `ai.summarizer` — summarizes website/selection/consent text.
  - `ai.languageDetector` — detects language before summarizing.
- **Data Sources:**
  - RDAP (for domain age & owner)
  - crt.sh (for certificate issuer & age)
- **Local Heuristics:** Tracker detection, pre-checked checkbox scan, fingerprinting patterns.

---

"## 🧱 Project Structure

| File / Folder | Purpose |
|----------------|----------|
| `manifest.json` | MV3 config (action opens side panel; restricted permissions) |
| `src/background/index.ts` | Background service: risk score, domain/cert fetch, redirect tracking |
| `src/content/index.ts` | Content script: cookies/consent detection, tracker scan, link hover preview |
| `src/panel/` | Side panel React UI (Trust, Cookies, Threats, Summaries) |
| `src/shared/` | Shared AI helpers, message types, and tracker lists |
| `vite.config.ts` | Build configuration for all components |" (write this better too)

---

## 🧠 How It Works (Feature Flow)

1. **Visit any website**
   - The extension auto‑checks HTTPS, certificate age/issuer, and domain age.
   -The badge color indicates the overall risk level. Click the toolbar icon to open a quick info popup, or right-click the icon to open the side panel for detailed insights.
2. **Detect cookies or pre‑checked boxes**
   - The panel lists detected consent text and any pre‑selected checkboxes or hidden opt‑outs.
   - Click “Summarize Consent” to get a short, clear overview of what you’re agreeing to.
3. **Scan for trackers**
   - The panel lists known trackers by type/domain
   - Click “Explain Threats” to see a short, plain‑English summary with recommended actions.
4. **Hover a link**
   - A tooltip shows the final redirect destination and a quick heuristic verdict (safe/suspicious/danger).
5. **Ask for a summary**
   - Use “Summarize Page” or “Summarize Selection” to run the on‑device summarizer on the current page or highlighted text.

---

## 🧠 Built‑in AI APIs Used

| API | Purpose | Requires Key |
|------|----------|---------------|
| **Summarizer API** (`ai.summarizer`) | Summarize website or consent text | ❌ No |
| **Language Detection API** (`ai.languageDetector`) | Detect text language | ❌ No |
|  |  |  |

> These APIs run **on‑device in Chrome 138+** — no cloud keys required.  
> If unavailable on your channel, enable related flags at `chrome://flags` (see Chrome AI docs) and ensure your build includes on‑device models.

---

## 🧪 Testing Guide (for Judges)

1. **Install from ZIP**
   - Download the latest **[dist.zip](./releases/dist.zip)** from the **`releases`** folder.
   - Unzip the file, then go to **`chrome://extensions`** → enable **Developer mode** → click **Load unpacked** → and select the extracted **`dist`** folder.
2. **Open sites to test:**
   - **Wikipedia.org** → try summarizing an article (tests summarizer + language detection)
   - **NYTimes.com** → detects trackers and cookie banners (tests consent + threat detection)
   - **BMW.com** → shows cookie summary and trust details
3. **Expected behaviors:**
   - Clicking the toolbar icon opens the popup panel for quick info.
   - Right-clicking the toolbar icon to open the side panel for detailed insights.
   - “Cookies” lists detected consent text; “Summarize Consent” generates bullets.
   - “Threats” lists trackers; “Explain Threats” generates bullets.
   - Hovering links shows a tooltip with the final URL and a quick verdict.
   - Clicking summarize page or summarize selection to run the on-device summarizer on the current page or highlighted text.

---

## ⚙️ Development Commands

```bash
npm install
npm run dev   # for local builds (reload after build)
npm run build # production build to dist/

Then open Chrome → chrome://extensions → Load unpacked → select dist/.
🧰 Optional Configuration
Setting	Description
useMockData	Fill trust fields with mock values for demos (default false)
whoisEndpoint	Custom RDAP/WHOIS endpoint (default builtin:rdap)
certEndpoint	Custom crt.sh endpoint (default builtin:crtsh)
VITE_SAFE_BROWSING_API_KEY	Optional Safe Browsing lookup (not enabled by default)
🧑‍⚖️ Privacy & Security

- On‑device AI (Summarizer, Language Detector) — no content sent to servers.
- External lookups (RDAP / crt.sh) are anonymous and cached for 24h.
- Optional Safe Browsing checks (if you wire them) are off by default.

🎯 Why It Stands Out

- Local, privacy‑preserving AI — intelligence runs inside Chrome.
- Covers key risks: authenticity, cookies/consent, hidden threats, and redirects.
- Accessible UI — clear status badge, lists, and human‑readable summaries.
- Hackathon‑ready — fast to install from `dist.zip`, easy to verify.

📋 Chrome Version and Flags

- Use **Chrome 138+** (or newer Canary/Dev with on‑device AI enabled).
- If the AI APIs are unavailable, enable related flags at `chrome://flags` (per official docs) and ensure **no enterprise policy** disables on‑device models; keep Chrome updated so required components/models are present.
- Reference: https://developer.chrome.com/docs/ai/

✅ Policy Compliance Notes

- Minimal permissions (no remote code execution).
- No personal data collection or telemetry beyond what is needed for feature operation.
- On‑device AI only; optional external lookups are to public endpoints (RDAP/crt.sh).

📜 License

MIT License. See LICENSE.