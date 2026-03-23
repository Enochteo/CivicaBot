/**
 * Scraper: Power Coalition GOTV — powercoalition.org/get-out-the-vote
 * Targets get-out-the-vote resources, events, and voter registration info.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const GOTV_URL = 'https://powercoalition.org/get-out-the-vote';
const BASE_URL = 'https://powercoalition.org';

export async function scrapeGOTV() {
  const results = [];

  const targets = [GOTV_URL, `${BASE_URL}/vote`, `${BASE_URL}/voter-registration`];

  for (const url of targets) {
    try {
      const { data } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
      });

      const $ = cheerio.load(data);
      $('script, style, nav, footer, noscript').remove();

      const candidates = [];

      // Grab key headings and their surrounding content
      $('h1, h2, h3').slice(0, 15).each((_, el) => {
        const title = $(el).text().trim();
        const body = makeSummary(
          $(el).nextAll('p, li').slice(0, 6).text(),
          $(el).closest('section, article, div').find('p, li').slice(0, 8).text(),
        );
        const href = $(el).find('a').first().attr('href')
          || $(el).nextAll('a').first().attr('href');
        if (title && title.length > 8) {
          candidates.push({
            title: title.slice(0, 140),
            summary: body,
            detailUrl: absoluteUrl(BASE_URL, href) || url,
          });
        }
      });

      // Also grab any event or action items
      $('a[href*="register"], a[href*="vote"], a[href*="election"], a[href*="ballot"]').slice(0, 10).each((_, el) => {
        const linkText = $(el).text().trim();
        const href = $(el).attr('href');
        if (linkText && linkText.length > 5) {
          const detailUrl = absoluteUrl(BASE_URL, href) || url;
          candidates.push({
            title: linkText.slice(0, 140),
            summary: makeSummary(
              $(el).closest('section, article, div, li').find('p, li').slice(0, 6).text(),
              'Voter action and participation resource.',
            ),
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
          source: 'Power Coalition — GOTV',
          title: candidate.title,
          summary,
          date: null,
          url: candidate.detailUrl || url,
        });

        if (results.length >= 12) break;
      }

      if (results.length > 0) break;
    } catch (err) {
      console.warn(`[gotv] ${url} failed: ${err.message}`);
    }
  }

  //console.log(results)
  return results;
}
