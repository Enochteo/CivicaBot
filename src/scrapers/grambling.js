/**
 * Scraper: City of Grambling — cityofgrambling.org
 * Targets news/announcements from the official city website.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { absoluteUrl, fetchDetailSummary, makeSummary } from './utils.js';

const BASE_URL = 'https://www.cityofgrambling.org';
const TARGETS = [
  `${BASE_URL}/grambling-city-news`,
  `${BASE_URL}/city-meetings-%26-events`,
  BASE_URL,
];

export async function scrapeGramblingCity() {
  const results = [];

  for (const target of TARGETS) {
    try {
      const { data } = await axios.get(target, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
      });

      const $ = cheerio.load(data);
      $('script, style, nav, footer, noscript').remove();

      const candidates = [];

      $('[data-aid*="TITLE"], [data-aid*="HEADLINE"], h1, h2, h3, h4').slice(0, 20).each((_, el) => {
        const title = $(el).text().trim();
        if (!title || title.length < 8) return;
        if (/^(welcome|contact us|follow us|send|accept|decline)$/i.test(title)) return;

        const container = $(el).closest('section, article, div');
        const body = makeSummary(container.find('p, li').slice(0, 10).text());
        const href = container.find('a').first().attr('href') || $(el).find('a').first().attr('href');
        const detailUrl = absoluteUrl(BASE_URL, href) || target;

        if (body.length < 20) return;

        candidates.push({
          title: title.slice(0, 140),
          summary: body,
          detailUrl,
        });
      });

      const seen = new Set();
      for (const candidate of candidates) {
        const key = `${candidate.title.toLowerCase()}|${candidate.detailUrl}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const detailSummary = await fetchDetailSummary(candidate.detailUrl, cheerio);

        results.push({
          source: 'City of Grambling',
          title: candidate.title,
          summary: makeSummary(candidate.summary, detailSummary),
          date: null,
          url: candidate.detailUrl,
        });

        if (results.length >= 12) break;
      }

      if (results.length >= 5) break;
    } catch (err) {
      console.warn(`[grambling] ${target} failed: ${err.message}`);
    }
  }

  if (results.length === 0) {
    try {
      const { data } = await axios.get(BASE_URL, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VotePlease/1.0)' },
      });
      const $ = cheerio.load(data);
      $('script, style, nav, footer, noscript').remove();
      $('h2, h3').slice(0, 8).each((_, el) => {
        const title = $(el).text().trim();
        const body = makeSummary($(el).nextAll('p, li').slice(0, 6).text());
        if (title && body && title.length > 10) {
          results.push({
            source: 'City of Grambling',
            title: title.slice(0, 140),
            summary: body,
            date: null,
            url: BASE_URL,
          });
        }
      });
    } catch (e) {
      console.warn(`[grambling] Homepage fallback failed: ${e.message}`);
    }
  }
  return results;
}

