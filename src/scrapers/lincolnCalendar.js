/**
 * Scraper: Lincoln Parish Calendar — lincolnparish.org/calendar
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const URL = 'https://www.lincolnparish.org/calendar';

export async function scrapeLincolnCalendar() {
  const results = [];

  try {
    const { data } = await axios.get(URL, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
    });

    const $ = cheerio.load(data);
    $('script, style, nav, footer, noscript').remove();

    const candidates = [];

    // Event items are embedded in calendar day cells as `.view-item-calendar`.
    $('.view-item-calendar .contents').each((_, el) => {
      const title = $(el).find('.views-field-title a, .views-field-title').first().text().trim();
      const date = $(el)
        .find('.views-field-field-calendar-date-1 .field-content, .views-field-field-calendar-date .field-content, time')
        .first()
        .text()
        .trim();
      const desc = makeSummary(
        $(el)
          .find('.views-field-field-calendar-description .field-content, .views-field-body .field-content, p, li')
          .slice(0, 8)
          .text(),
      );
      const link = $(el).find('.views-field-title a').first().attr('href');
      const detailUrl = absoluteUrl(URL, link) || URL;

      if (!title || title.length < 6) return;

      candidates.push({
        title: title.slice(0, 140),
        summary: desc,
        date: date || null,
        detailUrl,
      });
    });

    // Fallback: grab table-based calendars
    if (candidates.length === 0) {
      $('.views-field-title a').slice(0, 12).each((_, el) => {
        const title = $(el).text().trim();
        if (title.length > 5) {
          const detailUrl = absoluteUrl(URL, $(el).attr('href')) || URL;
          candidates.push({
            title: title.slice(0, 140),
            summary: '',
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
        source: 'Lincoln Parish Calendar',
        title: candidate.title,
        summary: makeSummary(candidate.summary, detailSummary),
        date: candidate.date,
        url: candidate.detailUrl,
      });

      if (results.length >= 14) break;
    }
  } catch (err) {
    console.warn(`[lincolnCalendar] Scrape failed: ${err.message}`);
  }

  return results;
}
