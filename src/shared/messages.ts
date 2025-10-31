export type TrackerHit = {
  url: string;
  domain: string;
  type: 'analytics' | 'ads' | 'social' | 'unknown';
};

export type RedirectHop = {
  from: string;
  to: string;
  status?: number;
};

export type ConsentFinding = {
  kind: 'banner' | 'prechecked' | 'hidden-optout';
  text?: string;
  selector?: string;
};

export type TrustReport = {
  isHttps: boolean;
  hostname: string;
  safebrowsingFlag?: boolean;
  domainAgeDays?: number; // WHOIS-derived
  certIssuer?: string; // Certificate issuer (e.g., DigiCert)
  certExpiry?: string; // ISO date string when the cert expires
  certIssuedDaysAgo?: number; // Days since issuance if available
};

export type ThreatsReport = {
  trackers: TrackerHit[];
  fingerprintingSignals: string[];
};

export type LinksReport = {
  redirectChain: RedirectHop[];
};

export type ConsentReport = {
  findings: ConsentFinding[];
  summary?: string;
};

export type SummariesReport = {
  pageSummary?: string;
  selectionSummary?: string;
};

export type RiskLevel = 'secure' | 'caution' | 'danger';

export type LogEntry = {
  ts: number;
  level: 'info' | 'warn' | 'error';
  text: string;
  tag?: 'trust' | 'consent' | 'threat' | 'link' | 'lang';
};

export type SiteVerdict = {
  risk: RiskLevel;
  badgeText?: string;
  logs: LogEntry[];
  spoofedLike?: string;
  score?: number;
};

export type PageAnalysis = {
  tabId: number;
  url: string;
  trust: TrustReport;
  consent: ConsentReport;
  threats: ThreatsReport;
  links: LinksReport;
  summaries: SummariesReport;
  verdict?: SiteVerdict;
};

export type MsgFromContent =
  | { type: 'CONTENT/CONSENT_FINDINGS'; tabId: number; findings: ConsentFinding[]; bannerText?: string }
  | { type: 'CONTENT/TRACKERS'; tabId: number; trackers: TrackerHit[] }
  | { type: 'CONTENT/FINGERPRINTING'; tabId: number; signals: string[] }
  | { type: 'CONTENT/LINK_HOVER'; tabId: number; href: string }
  | { type: 'CONTENT/REQUEST_ANALYSIS'; tabId: number; url: string };

export type MsgToContent =
  | { type: 'BG/HOVER_PREVIEW'; finalUrl?: string; chain?: RedirectHop[]; hoverVerdict?: 'safe' | 'suspicious' | 'danger'; reason?: string };

export type MsgFromPanel =
  | { type: 'PANEL/GET_ANALYSIS'; tabId?: number }
  | { type: 'PANEL/SUMMARIZE_PAGE'; tabId?: number }
  | { type: 'PANEL/SUMMARIZE_SELECTION'; tabId?: number }
  | { type: 'PANEL/OPEN_SIDE_PANEL'; tabId?: number }
  | { type: 'PANEL/LANG_LOG'; tabId?: number; text: string };

export type MsgToPanel =
  | { type: 'BG/ANALYSIS'; analysis: PageAnalysis }
  | { type: 'BG/STATUS'; text: string }
  | { type: 'BG/ALERT'; verdict: SiteVerdict; headline: string }
  | { type: 'BG/SUMMARY_RESULT'; summary?: string; error?: string };
