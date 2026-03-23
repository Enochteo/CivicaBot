/**
 * Scraper: Louisiana Secretary of State — sos.la.gov
 * Targets elections, voting info, and key announcements.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const BASE_URL = 'https://www.sos.la.gov';
const ELECTIONS_URL = `${BASE_URL}/ElectionsAndVoting/Pages/default.aspx`;
const NEWS_URL = `${BASE_URL}/OurOffice/Pages/News.aspx`;

export async function scrapeLouisianaSOS() {
  const results = [];

  const targets = [
    { url: ELECTIONS_URL, label: 'Elections & Voting' },
    { url: NEWS_URL, label: 'SOS News' },
    { url: BASE_URL, label: 'Homepage' },
  ];

  for (const target of targets) {
    try {
      const { data } = await axios.get(target.url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
      });

      const $ = cheerio.load(data);
      $('script, style, nav, footer, noscript').remove();

      const candidates = [];

      // SharePoint/gov-style selectors
      $([
        '.ms-rtestate-field', '.ms-wpContentDivSpace',
        'article', '.news-item', '[class*="announcement"]',
        '.field-item', '.views-row',
      ].join(', ')).slice(0, 24).each((_, el) => {
        const title = $(el).find('h1, h2, h3, h4, strong, .ms-rteElement-H2, a').first().text().trim();
        const body = makeSummary($(el).find('p, li, span').slice(0, 8).text());
        const link = $(el).find('a').first().attr('href');
        const detailUrl = absoluteUrl(target.url, link) || target.url;
        if (title && title.length > 10) {
          candidates.push({
            source: `Louisiana SOS — ${target.label}`,
            title: title.slice(0, 150),
            summary: body,
            detailUrl,
          });
        }
      });

      // Generic heading fallback
      if (candidates.length === 0) {
        $('h2, h3').slice(0, 10).each((_, el) => {
          const title = $(el).text().trim();
          if (title.length > 10) {
            const detailUrl = absoluteUrl(target.url, $(el).find('a').first().attr('href')) || target.url;
            candidates.push({
              source: `Louisiana SOS — ${target.label}`,
              title: title.slice(0, 150),
              summary: makeSummary($(el).nextAll('p, li').slice(0, 6).text()),
              detailUrl,
            });
          }
        });
      }

      const seen = new Set();
      for (const candidate of candidates) {
        const key = `${candidate.title.toLowerCase()}|${candidate.detailUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const detailSummary = await fetchDetailSummary(candidate.detailUrl, cheerio);
        results.push({
          source: candidate.source,
          title: candidate.title,
          summary: makeSummary(candidate.summary, detailSummary),
          date: null,
          url: candidate.detailUrl,
        });

        if (results.length >= 16) break;
      }

      // Only scrape the first page that yields results
      if (results.length > 0) break;
    } catch (err) {
      console.warn(`[sos] ${target.url} failed: ${err.message}`);
    }
  }

  return results;
}
