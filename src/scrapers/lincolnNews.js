/**
 * Scraper: Lincoln Parish News — lincolnparish.org/news
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const URL = 'https://www.lincolnparish.org/news';

export async function scrapeLincolnNews() {
  const results = [];

  try {
    const { data } = await axios.get(URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
    });

    const $ = cheerio.load(data);
    $('script, style, nav, footer, noscript').remove();

    const candidates = [];

    $('.view-content table.views-table tbody tr').each((_, el) => {
      const title = $(el).find('.views-field-field-alternate-title a, .views-field-title a').first().text().trim();
      const date = $(el).find('.views-field-field-news .date-display-single, .views-field-field-news').first().text().trim();
      const type = $(el).find('.views-field-field-news-type').first().text().trim();
      const body = makeSummary(
        type ? `Type: ${type}` : '',
        $(el).find('.views-field-body .field-content, .views-field-field-news .field-content').slice(0, 3).text(),
      );
      const link = $(el).find('.views-field-field-alternate-title a, .views-field-title a').first().attr('href');
      const detailUrl = absoluteUrl(URL, link) || URL;

      if (title && title.length > 5) {
        candidates.push({
          title: title.slice(0, 140),
          summary: body,
          date: date || null,
          detailUrl,
        });
      }
    });

    // Fallback: grab prominent headings
    if (candidates.length === 0) {
      $('.views-row .views-field-field-alternate-title .field-content, .views-row .views-field-title a').slice(0, 8).each((_, el) => {
        const title = $(el).text().trim();
        const body = makeSummary(
          $(el).closest('.views-row').find('.views-field-field-news .field-content, .views-field-body .field-content').slice(0, 4).text(),
        );
        const detailUrl = absoluteUrl(URL, $(el).attr('href')) || URL;
        if (title && title.length > 10) {
          candidates.push({
            title: title.slice(0, 140),
            summary: body,
            date: null,
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
        source: 'Lincoln Parish News',
        title: candidate.title,
        summary: makeSummary(candidate.summary, detailSummary),
        date: candidate.date,
        url: candidate.detailUrl,
      });

      if (results.length >= 14) break;
    }
  } catch (err) {
    console.warn(`[lincolnNews] Scrape failed: ${err.message}`);
  }

  return results;
}
