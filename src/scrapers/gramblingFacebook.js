/**
 * Scraper: City of Grambling Facebook Page
 * facebook.com/City-of-Grambling
 *
 * NOTE: Facebook requires authentication and aggressively blocks scrapers.
 * This module uses a lightweight public-facing approach. For reliable Facebook
 * data, connect a Facebook Page Access Token via the Graph API instead.
 *
 * To enable Graph API:
 *   1. Create a Facebook App at developers.facebook.com
 *   2. Add the "Pages" product and get a Page Access Token
 *   3. Set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN in .env
 */
import axios from 'axios';

const FB_PAGE_ID = process.env.FB_PAGE_ID || '';
const FB_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const FB_API_VERSION = 'v19.0';

export async function scrapeGramblingFacebook() {
  // If Facebook Graph API credentials are configured, use them
  if (FB_PAGE_ID && FB_ACCESS_TOKEN) {
    return fetchViaGraphAPI();
  }

  // Without credentials, skip this source to avoid polluting the digest
  // with non-civic placeholder content.
  console.warn('[facebook] No FB credentials set — skipping Facebook scrape.');
  return [];
}

async function fetchViaGraphAPI() {
  const results = [];
  try {
    const url = `https://graph.facebook.com/${FB_API_VERSION}/${FB_PAGE_ID}/posts`;
    const { data } = await axios.get(url, {
      timeout: 15000,
      params: {
        access_token: FB_ACCESS_TOKEN,
        fields: 'message,story,created_time,permalink_url',
        limit: 5,
      },
    });

    for (const post of (data.data || [])) {
      const text = post.message || post.story || '';
      if (!text) continue;
      results.push({
        source: 'City of Grambling Facebook',
        title: text.split('\n')[0].slice(0, 100) || 'Facebook Post',
        summary: text.slice(0, 300),
        date: post.created_time || null,
        url: post.permalink_url || 'https://www.facebook.com/City-of-Grambling',
      });
    }
  } catch (err) {
    console.warn(`[facebook] Graph API failed: ${err.message}`);
  }
  return results;
}
