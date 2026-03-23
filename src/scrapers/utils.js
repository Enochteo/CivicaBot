import axios from 'axios';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)',
};

const DETAIL_CACHE = new Map();

export function normalizeWhitespace(text = '') {
  return text.replace(/\s+/g, ' ').trim();
}

export function stripBoilerplate(text = '') {
  let cleaned = normalizeWhitespace(text);
  cleaned = cleaned.replace(/\b(this website uses cookies|accept all cookies|privacy policy|terms of use)\b/gi, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  return cleaned;
}

export function absoluteUrl(base, href) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `https:${href}`;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

export function makeSummary(...chunks) {
  const joined = chunks
    .map((chunk) => stripBoilerplate(chunk || ''))
    .filter(Boolean)
    .join(' ');

  const summary = normalizeWhitespace(joined);
  return summary.slice(0, 900);
}

export async function fetchHtml(url, timeout = 15000) {
  const { data } = await axios.get(url, {
    timeout,
    headers: DEFAULT_HEADERS,
  });
  return data;
}

export async function fetchDetailSummary(url, cheerio, selectors = 'article, main, .entry-content, .post-content, .content, .field-content, p') {
  if (!url) return '';
  if (DETAIL_CACHE.has(url)) return DETAIL_CACHE.get(url);

  try {
    const html = await fetchHtml(url, 12000);
    const $ = cheerio.load(html);
    $('script, style, nav, footer, noscript').remove();

    const text = $(selectors)
      .slice(0, 20)
      .map((_, el) => $(el).text())
      .get()
      .join(' ');

    const summary = makeSummary(text);
    DETAIL_CACHE.set(url, summary);
    return summary;
  } catch {
    DETAIL_CACHE.set(url, '');
    return '';
  }
}
