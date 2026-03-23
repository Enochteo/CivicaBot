/**
 * Scraper orchestrator — runs all civic source scrapers in parallel
 * and returns a consolidated array of items for the AI agent to summarize.
 */
import { scrapeGramblingCity } from './grambling.js';
import { scrapeGramblingFacebook } from './gramblingFacebook.js';
import { scrapeLincolnCalendar } from './lincolnCalendar.js';
import { scrapeLincolnNews } from './lincolnNews.js';
import { scrapeLouisianaSOS } from './sos.js';
import { scrapePowerCoalition } from './powerCoalition.js';
import { scrapeGOTV } from './gotv.js';

/**
 * Run all scrapers concurrently, collecting results and swallowing
 * individual failures so one bad source doesn't kill the whole digest.
 *
 * @returns {Promise<Array<{source, title, summary, date, url}>>}
 */
export async function scrapeAll() {
  console.log('[scrapers] Starting all scrapers…');

  const scrapers = [
    { name: 'Grambling City', fn: scrapeGramblingCity },
    { name: 'Grambling Facebook', fn: scrapeGramblingFacebook },
    { name: 'Lincoln Calendar', fn: scrapeLincolnCalendar },
    { name: 'Lincoln News', fn: scrapeLincolnNews },
    { name: 'Louisiana SOS', fn: scrapeLouisianaSOS },
    { name: 'Power Coalition', fn: scrapePowerCoalition },
    { name: 'GOTV', fn: scrapeGOTV },
  ];

  const settled = await Promise.allSettled(scrapers.map(s => s.fn()));

  const all = [];
  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const items = result.value || [];
      console.log(`[scrapers] ${scrapers[i].name}: ${items.length} item(s)`);
      all.push(...items);
    } else {
      console.warn(`[scrapers] ${scrapers[i].name} errored: ${result.reason?.message}`);
    }
  });

  console.log(`[scrapers] Total items collected: ${all.length}`);
  return all;
}
