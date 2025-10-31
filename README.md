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

### Installation & Setup
```bash
npm install
npm run dev      # Local development with auto-reload
npm run build    # Production build to dist/
```
**Chrome Installation:**
1. Go to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

## ⚙️ Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `useMockData` | Fill trust fields with mock values for demonstrations | `false` |
| `whoisEndpoint` | Custom RDAP/WHOIS endpoint | `builtin:rdap` |
| `certEndpoint` | Custom crt.sh certificate endpoint | `builtin:crtsh` |
| `VITE_SAFE_BROWSING_API_KEY` | Optional Google Safe Browsing API key | Not enabled |

## 🔒 Privacy & Security

### Data Handling
- **On-device AI Processing**: All AI features (Summarizer, Language Detector) run locally - no data sent to external servers
- **External Lookups**: RDAP and crt.sh queries are anonymous with 24-hour caching
- **Safe Browsing**: Optional feature disabled by default

### Compliance
- Minimal permissions required
- No remote code execution capabilities
- No personal data collection or telemetry
- External lookups use public endpoints only

## 🎯 Key Features & Differentiators

- **Local AI Intelligence**: Privacy-preserving analysis running entirely within Chrome
- **Comprehensive Risk Coverage**: Authenticity verification, cookie/consent analysis, threat detection, and redirect tracing
- **Accessible Interface**: Clear status badges, organized lists, and human-readable summaries
- **Hackathon-Ready**: Quick installation from `dist.zip` with easy verification

## 📋 System Requirements

### Chrome Version
- **Chrome 138+** required

### AI Feature Setup
If AI APIs are unavailable:
1. Enable relevant flags at `chrome://flags` (refer to official Chrome AI documentation)
2. Ensure no enterprise policies disable on-device models
3. Keep Chrome updated for required components and models

**Reference**: [Chrome AI Developer Documentation](https://developer.chrome.com/docs/ai/)

## 📜 License

MIT License - See LICENSE file for complete terms.

---

