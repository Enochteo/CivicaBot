/**
 * Monday Morning Scheduler
 *
 * Runs the civic scrape → AI summary → SMS broadcast pipeline
 * every Monday at 9:00 AM Central Time (America/Chicago).
 *
 * Cron expression: "0 9 * * 1"
 *   ┌───── minute (0)
 *   │ ┌───── hour (9)
 *   │ │ ┌───── day-of-month (*)
 *   │ │ │ ┌───── month (*)
 *   │ │ │ │ ┌───── day-of-week (1 = Monday)
 *   0 9 * * 1
 */
import cron from 'node-cron';
import { scrapeAll } from '../scrapers/index.js';
import { generateWeeklyDigest } from '../agent/index.js';
import { broadcastDigest } from '../sms/index.js';
import { getAllSubscribedUsers } from '../db/index.js';

/**
 * Run the full pipeline: scrape → summarize → broadcast.
 * Can be called manually (e.g., for testing) or by the cron job.
 */
export async function runWeeklyPipeline() {
  console.log('\n========================================');
  console.log('VotePlease Weekly Digest Pipeline START');
  console.log(new Date().toISOString());
  console.log('========================================');

  try {
    // 1. Scrape all civic sources
    const items = await scrapeAll();

    // 2. Generate AI digest
    console.log('[scheduler] Generating AI digest…');
    const digest = await generateWeeklyDigest(items);
    console.log('[scheduler] Digest generated:');
    console.log(digest);

    // 3. Get all subscribers
    const subscribers = await getAllSubscribedUsers();
    console.log(`[scheduler] ${subscribers.length} subscriber(s) found`);

    if (subscribers.length === 0) {
      console.log('[scheduler] No subscribers — skipping broadcast.');
      return { digest, sent: 0, failed: 0 };
    }

    // 4. Broadcast
    const { sent, failed } = await broadcastDigest(digest, subscribers);

    console.log('========================================');
    console.log('Pipeline COMPLETE');
    console.log(`  Items scraped : ${items.length}`);
    console.log(`  Digest length : ${digest.length} chars`);
    console.log(`  SMS sent      : ${sent}`);
    console.log(`  SMS failed    : ${failed}`);
    console.log('========================================\n');

    return { digest, sent, failed };
  } catch (err) {
    console.error('[scheduler] Pipeline FAILED:', err.message);
    throw err;
  }
}

/**
 * Start the cron scheduler.
 * Schedules the weekly pipeline for every Monday at 9 AM Central.
 */
export function startScheduler() {
  const timezone = process.env.TZ || 'America/Chicago';
  const schedule = process.env.CRON_SCHEDULE || '0 9 * * 1';

  console.log(`[scheduler] Starting cron: "${schedule}" (${timezone})`);

  const task = cron.schedule(
    schedule,
    async () => {
      console.log('[scheduler] Cron triggered — running weekly pipeline…');
      try {
        await runWeeklyPipeline();
      } catch (err) {
        console.error('[scheduler] Unhandled pipeline error:', err);
      }
    },
    {
      timezone,
      scheduled: true,
    },
  );

  console.log('[scheduler] Cron job scheduled ✓');
  return task;
}
