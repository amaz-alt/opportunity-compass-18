import { config } from './config.js';
import {
  ensureCollector, log, updateCollectorStatus, insertRawEvents,
  incrementEventsCollected, getLastCheckpoint, saveCheckpoint,
} from './db.js';
import { fetchNewPosts, fetchComments } from './producthunt.js';
import { normalizePost, normalizeComment } from './normalize.js';
import { logger } from './logger.js';

class Collector {
  constructor() {
    this.running = false;
    this.timer = null;
    this.currentRun = null;
    this.stats = {
      lastRunAt: null,
      lastSuccessAt: null,
      lastError: null,
      runsCompleted: 0,
      eventsCollected: 0,
    };
  }

  isRunning() { return this.running; }
  getStats() { return { ...this.stats, running: this.running }; }

  async start() {
    if (this.running) return { started: false, reason: 'already running' };
    const collector = await ensureCollector();
    if (!collector.enabled) {
      await log('warn', 'Collector row is disabled — refusing to start');
      return { started: false, reason: 'collector disabled in database' };
    }
    this.running = true;
    await updateCollectorStatus({ status: 'running' });
    await log('info', 'Collector started', { intervalSeconds: config.pollIntervalSeconds });
    this.scheduleNext(0);
    return { started: true };
  }

  async stop() {
    if (!this.running) return { stopped: false, reason: 'not running' };
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.currentRun) {
      try { await this.currentRun; } catch { /* swallow */ }
    }
    await updateCollectorStatus({ status: 'idle' });
    await log('info', 'Collector stopped');
    return { stopped: true };
  }

  scheduleNext(delayMs) {
    if (!this.running) return;
    this.timer = setTimeout(() => this.runOnce(), delayMs);
  }

  async runOnce() {
    if (!this.running) return;
    const started = Date.now();
    this.stats.lastRunAt = new Date().toISOString();
    await updateCollectorStatus({ status: 'running', last_run_at: this.stats.lastRunAt });
    this.currentRun = this._doRun().catch((err) => err);
    const result = await this.currentRun;
    this.currentRun = null;
    if (result instanceof Error) {
      this.stats.lastError = result.message;
      await updateCollectorStatus({ status: 'error', last_error: result.message });
      await log('error', 'Collector run failed', { error: result.message });
    } else {
      this.stats.lastSuccessAt = new Date().toISOString();
      this.stats.lastError = null;
      this.stats.runsCompleted += 1;
      this.stats.eventsCollected += result.inserted;
      await updateCollectorStatus({
        status: 'idle',
        last_success_at: this.stats.lastSuccessAt,
        last_error: null,
      });
      await log('info', 'Collector run finished', {
        inserted: result.inserted,
        postsFetched: result.postsFetched,
        commentsFetched: result.commentsFetched,
        durationMs: Date.now() - started,
      });
    }
    this.scheduleNext(config.pollIntervalSeconds * 1000);
  }

  async _doRun() {
    const collector = await ensureCollector();
    const checkpoint = await getLastCheckpoint();
    const postedAfter = checkpoint.last_post_created_at || null;
    const commentSince = checkpoint.last_comment_created_at || null;

    const posts = await fetchNewPosts({ postedAfter, limit: config.postsPerRun });
    logger.info({ count: posts.length, postedAfter }, 'Fetched posts');

    const events = [];
    let newestPostAt = postedAfter;
    let newestCommentAt = commentSince;
    let commentsFetched = 0;

    for (const post of posts) {
      events.push(normalizePost(collector.id, post));
      if (!newestPostAt || new Date(post.createdAt) > new Date(newestPostAt)) {
        newestPostAt = post.createdAt;
      }
      try {
        const comments = await fetchComments(post.id, {
          limit: config.commentsPerPost,
          since: commentSince,
        });
        commentsFetched += comments.length;
        for (const c of comments) {
          events.push(normalizeComment(collector.id, post, c));
          if (!newestCommentAt || new Date(c.createdAt) > new Date(newestCommentAt)) {
            newestCommentAt = c.createdAt;
          }
        }
      } catch (err) {
        await log('warn', `Failed to fetch comments for ${post.slug}`, { error: err.message });
      }
    }

    // Chunked upsert to avoid huge payloads
    let inserted = 0;
    const CHUNK = 200;
    for (let i = 0; i < events.length; i += CHUNK) {
      const res = await insertRawEvents(events.slice(i, i + CHUNK));
      inserted += res.inserted;
    }
    await incrementEventsCollected(inserted);

    await saveCheckpoint({
      last_post_created_at: newestPostAt,
      last_comment_created_at: newestCommentAt,
      last_run_at: new Date().toISOString(),
    });

    return { inserted, postsFetched: posts.length, commentsFetched };
  }
}

export const collector = new Collector();
