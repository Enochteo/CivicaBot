/**
 * Scraper: Power Coalition — powercoalition.org
 * Targets voter engagement news and updates.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const BASE_URL = 'https://powercoalition.org';

export async function scrapePowerCoalition() {
  const results = [];

  const targets = [
    `${BASE_URL}/news`,
    `${BASE_URL}/updates`,
    `${BASE_URL}/blog`,
    BASE_URL,
  ];

  for (const url of targets) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
      });

      const $ = cheerio.load(data);
      $('script, style, nav, footer, noscript').remove();

      const candidates = [];

      $('article, .post, .entry, [class*="news"], [class*="blog"], .card').slice(0, 20).each((_, el) => {
        const title = $(el).find('h1, h2, h3, .title, .entry-title, a').first().text().trim();
        const body = makeSummary(
          $(el).find('p, li, .excerpt, .entry-content, .description').slice(0, 8).text(),
        );
        const date = $(el).find('time, .date, .published').first().text().trim()
          || $(el).find('time').attr('datetime');
        const link = $(el).find('a').first().attr('href');
        const detailUrl = absoluteUrl(BASE_URL, link) || url;

        if (title && title.length > 8) {
          candidates.push({
            title: title.slice(0, 140),
            summary: body,
            date: date || null,
            detailUrl,
          });
        }
      });

      const seen = new Set();
      for (const candidate of candidates) {
        const key = `${candidate.title.toLowerCase()}|${candidate.detailUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const detailSummary = await fetchDetailSummary(candidate.detailUrl, cheerio);
        const summary = makeSummary(candidate.summary, detailSummary);

        results.push({
          source: 'Power Coalition',
          title: candidate.title,
          summary,
          date: candidate.date,
          url: candidate.detailUrl,
        });

        if (results.length >= 14) break;
      }

      if (results.length > 0) break;
    } catch (err) {
      console.warn(`[powerCoalition] ${url} failed: ${err.message}`);
    }
  }

  return results;
}
