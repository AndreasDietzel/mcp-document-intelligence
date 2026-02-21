/**
 * AI Document Analysis via Perplexity API
 * Intelligent metadata extraction for document classification & naming.
 *
 * ISO 25010: Functional Suitability, Usability
 */

import { normalizeUnicode, sanitizeFilename } from "./security.js";
import type { ServerConfig } from "./config.js";

// --- Types ---

export interface AIDocumentAnalysis {
  category: string;
  company: string;
  documentType: string;
  keywords: string[];
  referenceNumber?: string;
  confidence: number;
}

const API_URL = "https://api.perplexity.ai/chat/completions";

// --- AI Analysis ---

export async function analyzeWithAI(
  text: string,
  config: ServerConfig,
): Promise<AIDocumentAnalysis | null> {
  if (!config.enableAI || !config.perplexityApiKey) return null;

  const truncated = text.slice(0, 2000);

  const prompt = `Analyze this document and extract metadata as JSON.

DOCUMENT:
${truncated}

TASK:
Extract:
1. category (choose: Telecom, Insurance, Health, Finance, Logistics, Online, Travel, Auto, Work, Education, Housing, Tax, Other)
2. company (full sender name)
3. documentType (e.g. Invoice, Contract, Notice, Reminder, Offer, Statement)
4. keywords (up to 5 short descriptive terms for filename, 2-15 chars, A-Z 0-9 - _ only)
5. referenceNumber (invoice/customer/contract number if present, else null)
6. confidence (0.0-1.0)

RESPONSE FORMAT (JSON only, no extra text):
{"category":"...","company":"...","documentType":"...","keywords":["..."],"referenceNumber":"...","confidence":0.95}`;

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.perplexityModel || "sonar",
        messages: [
          { role: "system", content: "You are a document analysis expert. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.2,
        stream: false,
      }),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return parseAIResponse(content);
  } catch {
    return null;
  }
}

function parseAIResponse(raw: string): AIDocumentAnalysis | null {
  try {
    let json = raw.trim();
    if (json.startsWith("```")) {
      json = json.replace(/```(?:json)?\s*/g, "").replace(/```\s*$/g, "");
    }
    const p = JSON.parse(json);

    const analysis: AIDocumentAnalysis = {
      category: clean(p.category || "Other"),
      company: clean(p.company || ""),
      documentType: clean(p.documentType || ""),
      keywords: (p.keywords || [])
        .map((k: string) => clean(k))
        .filter((k: string) => k.length >= 2 && k.length <= 20)
        .slice(0, 5),
      referenceNumber: p.referenceNumber ? clean(p.referenceNumber) : undefined,
      confidence: Math.max(0, Math.min(1, p.confidence ?? 0.5)),
    };

    if (!analysis.company && !analysis.documentType && analysis.keywords.length === 0) {
      return null;
    }
    return analysis;
  } catch {
    return null;
  }
}

function clean(s: string): string {
  return s.trim().replace(/[<>:"|?*\x00-\x1f]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50);
}

// --- AI-powered date selection ---

export async function selectDateWithAI(
  text: string,
  dates: string[],
  config: ServerConfig,
): Promise<string | null> {
  if (!config.enableAI || !config.perplexityApiKey || dates.length <= 1) {
    return dates[0] ?? null;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.perplexityApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.perplexityModel || "sonar",
        messages: [
          { role: "system", content: "You are a document analysis expert. Reply only with a date in DD.MM.YYYY format." },
          {
            role: "user",
            content: `From this document, select the DOCUMENT DATE (letterhead date), not other dates like contract periods.\n\nDOCUMENT:\n${text.slice(0, 1500)}\n\nCANDIDATES: ${dates.join(", ")}\n\nReply with only the date (DD.MM.YYYY):`,
          },
        ],
        max_tokens: 50,
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    const m = content?.match(/(\d{2}\.\d{2}\.\d{4})/);
    if (m && dates.includes(m[1])) return m[1];
    return null;
  } catch {
    return null;
  }
}

// --- Smart filename builder ---

export function buildAIFilename(
  analysis: AIDocumentAnalysis,
  timestamp: string,
  ext: string,
): string {
  const parts: string[] = [];
  if (timestamp) parts.push(timestamp);
  if (analysis.company && analysis.confidence >= 0.5) parts.push(analysis.company);
  if (analysis.documentType) parts.push(analysis.documentType);

  const extra = analysis.keywords
    .filter((k) => k !== analysis.company && k !== analysis.documentType)
    .slice(0, 3);
  parts.push(...extra);

  if (analysis.referenceNumber && analysis.referenceNumber.length <= 30) {
    parts.push(analysis.referenceNumber);
  }

  const base = parts.filter((p) => p.length > 0).join("_");
  return sanitizeFilename(base + ext);
}

// --- Date / metadata extraction helpers ---

export async function extractDocumentDate(
  text: string,
  originalName: string,
  filePath: string,
  config: ServerConfig,
): Promise<string> {
  const scannerMatch = originalName.match(/(\d{4}-\d{2}-\d{2})/);
  if (scannerMatch) return scannerMatch[1];

  const textStart = text.slice(0, 1000);
  const allDates: string[] = [];
  for (const m of textStart.matchAll(/(\d{2}\.\d{2}\.\d{4})/g)) {
    const d = m[1];
    if (config.birthDate && d === config.birthDate) continue;
    if (!allDates.includes(d)) allDates.push(d);
  }

  if (allDates.length > 1 && config.enableAI) {
    const aiDate = await selectDateWithAI(text, allDates, config);
    if (aiDate) {
      const [day, month, year] = aiDate.split(".");
      return `${year}-${month}-${day}`;
    }
  }

  if (allDates.length > 0) {
    const [day, month, year] = allDates[0].split(".");
    return `${year}-${month}-${day}`;
  }

  const isoMatch = textStart.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  try {
    const { birthtime } = await import("fs").then((f) => f.statSync(filePath));
    const y = birthtime.getFullYear();
    const mo = String(birthtime.getMonth() + 1).padStart(2, "0");
    const d = String(birthtime.getDate()).padStart(2, "0");
    return `${y}-${mo}-${d}`;
  } catch {
    return "";
  }
}

export function extractReferences(text: string): string[] {
  const refs: string[] = [];
  const patterns = [
    /(?:Invoice|Rechnungs?[-\s]?Nr\.?|Rechnungsnummer)[:\s]+([A-Z0-9\-\/]+)/gi,
    /(?:Customer|Kunden[-\s]?Nr\.?|Kundennummer)[:\s]+([A-Z0-9\-\/]+)/gi,
    /(?:Contract|Vertrags?[-\s]?Nr\.?|Vertragsnummer)[:\s]+([A-Z0-9\-\/]+)/gi,
    /(?:Policy|Policen[-\s]?Nr\.?|Versicherungs[-\s]?Nr\.?)[:\s]+([A-Z0-9\-\/]+)/gi,
    /(?:Order[- ]?(?:No\.|#)|Bestell[-\s]?Nr\.?)[:\s]+([A-Z0-9\-\/]+)/gi,
    /(?:Aktenzeichen|AZ)[:\s]+([A-Z0-9\-\/]+)/gi,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      if (m[1] && m[1].length >= 3 && !refs.includes(m[1])) refs.push(m[1]);
    }
  }
  return refs;
}

export function extractKeywords(text: string): string[] {
  const kw: string[] = [];
  const patterns = [
    /\b(Rechnung|Invoice|Vertrag|Contract|Angebot|Offer|Bestellung|Order|Lieferschein|Mahnung|Bescheid|Kündigung|Kontoauszug|Rezept)\b/gi,
    /\b(Telekom|Vodafone|Amazon|PayPal|Sparkasse|Allianz|ERGO|Barmer|AOK|DHL|Deutsche Bank|Commerzbank|ING|N26)\b/gi,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const v = m[0].toLowerCase();
      if (!kw.includes(v)) kw.push(v);
    }
  }
  return kw;
}
