import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import crypto from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLATFORM = "producthunt";
const COLLECTOR_NAME = "Product Hunt";
const PH_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

type SupabaseCtx = { supabase: Awaited<ReturnType<typeof getCtx>>["supabase"]; userId: string };
async function getCtx(): Promise<never> { throw new Error("type helper only"); }

function sha256(...parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

type PhPost = {
  id: string; name: string; tagline: string; description: string;
  slug: string; url: string; website?: string; votesCount: number; commentsCount: number;
  createdAt: string; featuredAt?: string;
  user?: { id: string; name: string; username: string; headline?: string };
  makers?: Array<{ id: string; name: string; username: string; headline?: string }>;
  topics?: { edges: Array<{ node: { id: string; name: string; slug: string } }> };
  media?: Array<{ url: string; type: string }>;
  thumbnail?: { url: string };
};
type PhComment = {
  id: string; body: string; createdAt: string; votesCount: number; url?: string;
  user?: { id: string; name: string; username: string; headline?: string };
};

async function phGraphQL<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(PH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "signal-lovable-producthunt/1.0",
    },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Product Hunt API ${res.status}: ${text.slice(0, 500)}`);
  }
  let json: { data?: T; errors?: unknown };
  try { json = JSON.parse(text); } catch { throw new Error(`Non-JSON response: ${text.slice(0, 300)}`); }
  if (json.errors) throw new Error(`Product Hunt GraphQL error: ${JSON.stringify(json.errors).slice(0, 500)}`);
  return json.data as T;
}

const POSTS_QUERY = `
  query Posts($first: Int!, $after: String, $postedAfter: DateTime) {
    posts(first: $first, after: $after, order: NEWEST, postedAfter: $postedAfter) {
      pageInfo { hasNextPage endCursor }
      edges { node {
        id name tagline description slug url website votesCount commentsCount
        createdAt featuredAt
        user { id name username headline }
        makers { id name username headline }
        topics(first: 10) { edges { node { id name slug } } }
        media { url type } thumbnail { url }
      } }
    }
  }
`;

const COMMENTS_QUERY = `
  query Comments($postId: ID!, $first: Int!, $after: String) {
    post(id: $postId) {
      comments(first: $first, after: $after, order: NEWEST) {
        pageInfo { hasNextPage endCursor }
        edges { node { id body createdAt votesCount url user { id name username headline } } }
      }
    }
  }
`;

function normalizePost(collectorId: string, post: PhPost) {
  const externalId = `post:${post.id}`;
  return {
    collector_id: collectorId,
    platform: PLATFORM,
    external_id: externalId,
    source_url: post.url,
    author: post.user?.username || post.user?.name || null,
    title: post.name,
    content: [post.tagline, post.description].filter(Boolean).join("\n\n"),
    dedupe_hash: sha256(PLATFORM, externalId),
    metadata: {
      kind: "post", slug: post.slug, website: post.website ?? null,
      votes_count: post.votesCount, comments_count: post.commentsCount,
      created_at: post.createdAt, featured_at: post.featuredAt ?? null,
      thumbnail: post.thumbnail?.url ?? null, media: post.media ?? [],
      hunter: post.user ?? null,
      makers: post.makers ?? [],
      topics: (post.topics?.edges ?? []).map(e => e.node),
    },
  };
}

function normalizeComment(collectorId: string, post: PhPost, comment: PhComment) {
  const externalId = `comment:${comment.id}`;
  return {
    collector_id: collectorId,
    platform: PLATFORM,
    external_id: externalId,
    source_url: comment.url || post.url,
    author: comment.user?.username || comment.user?.name || null,
    title: `Comment on ${post.name}`,
    content: comment.body,
    dedupe_hash: sha256(PLATFORM, externalId),
    metadata: {
      kind: "comment", post_id: post.id, post_slug: post.slug, post_name: post.name,
      votes_count: comment.votesCount, created_at: comment.createdAt, user: comment.user ?? null,
    },
  };
}

type Config = {
  pollIntervalMinutes?: number;
  postsPerSync?: number;
  commentsPerPost?: number;
  checkpoint?: { lastPostAt?: string | null; lastCommentAt?: string | null };
};
const DEFAULTS = { pollIntervalMinutes: 30, postsPerSync: 20, commentsPerPost: 25 };

async function assertAdmin({ supabase, userId }: SupabaseCtx) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(`Role check failed: ${error.message}`);
  if (!data) throw new Error("Forbidden: admin role required");
}

async function ensureCollector({ supabase }: SupabaseCtx) {
  const { data: existing, error: selErr } = await supabase
    .from("collectors").select("*").eq("platform", PLATFORM).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;
  const { data, error } = await supabase.from("collectors").insert({
    name: COLLECTOR_NAME, platform: PLATFORM, enabled: false,
    config: DEFAULTS, schedule: null, status: "idle",
  }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

async function log(supabase: SupabaseCtx["supabase"], collectorId: string, level: "info"|"warn"|"error", message: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("collector_logs").insert({ collector_id: collectorId, level, message, metadata });
}

export const getProductHuntIntegration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const collector = await ensureCollector(context);
    const tokenPresent = Boolean(process.env.PRODUCT_HUNT_TOKEN);
    return {
      collector,
      tokenPresent,
      config: { ...DEFAULTS, ...(collector.config as Config) },
    };
  });

export const updateProductHuntSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    pollIntervalMinutes: z.number().int().min(1).max(1440),
    postsPerSync: z.number().int().min(1).max(100),
    commentsPerPost: z.number().int().min(0).max(100),
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const collector = await ensureCollector(context);
    const prev = (collector.config as Config) ?? {};
    const nextConfig: Config = {
      ...prev,
      pollIntervalMinutes: data.pollIntervalMinutes,
      postsPerSync: data.postsPerSync,
      commentsPerPost: data.commentsPerPost,
    };
    const { error } = await context.supabase.from("collectors").update({
      config: nextConfig, enabled: data.enabled,
    }).eq("id", collector.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const testProductHuntConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = process.env.PRODUCT_HUNT_TOKEN;
    const collector = await ensureCollector(context);
    if (!token) {
      await log(context.supabase, collector.id, "error", "Test connection failed: PRODUCT_HUNT_TOKEN not set");
      return { ok: false, error: "PRODUCT_HUNT_TOKEN is not configured." };
    }
    try {
      const data = await phGraphQL<{ posts: { edges: Array<{ node: PhPost }> } }>(
        token, POSTS_QUERY, { first: 1, after: null, postedAfter: null },
      );
      const node = data.posts.edges[0]?.node;
      await log(context.supabase, collector.id, "info", "Test connection succeeded", { sample_post: node?.slug });
      return { ok: true, sample: node ? { id: node.id, name: node.name, slug: node.slug, url: node.url, votesCount: node.votesCount, createdAt: node.createdAt } : null };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await log(context.supabase, collector.id, "error", "Test connection failed", { error: message });
      return { ok: false, error: message };
    }
  });

export const runProductHuntSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const token = process.env.PRODUCT_HUNT_TOKEN;
    const collector = await ensureCollector(context);
    if (!token) {
      await log(context.supabase, collector.id, "error", "Sync aborted: PRODUCT_HUNT_TOKEN not set");
      return { ok: false, error: "PRODUCT_HUNT_TOKEN is not configured." };
    }
    const cfg: Config = { ...DEFAULTS, ...(collector.config as Config) };
    const postsPerSync = cfg.postsPerSync ?? DEFAULTS.postsPerSync;
    const commentsPerPost = cfg.commentsPerPost ?? DEFAULTS.commentsPerPost;
    const checkpoint = cfg.checkpoint ?? {};
    const startedAt = new Date().toISOString();

    await context.supabase.from("collectors").update({ status: "running", last_run_at: startedAt, last_error: null }).eq("id", collector.id);
    await log(context.supabase, collector.id, "info", "Sync started", { postsPerSync, commentsPerPost, checkpoint });

    let postsFetched = 0, postsInserted = 0, commentsFetched = 0, commentsInserted = 0;
    let newestPostAt = checkpoint.lastPostAt ?? null;
    let newestCommentAt = checkpoint.lastCommentAt ?? null;

    try {
      // Paginated post fetch
      const posts: PhPost[] = [];
      let after: string | null = null;
      while (posts.length < postsPerSync) {
        const data: { posts: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: Array<{ node: PhPost }> } } =
          await phGraphQL(token, POSTS_QUERY, {
            first: Math.min(20, postsPerSync - posts.length),
            after,
            postedAfter: checkpoint.lastPostAt ?? null,
          });
        for (const e of data.posts.edges) posts.push(e.node);
        if (!data.posts.pageInfo.hasNextPage) break;
        after = data.posts.pageInfo.endCursor;
      }
      postsFetched = posts.length;

      if (posts.length > 0) {
        const rows = posts.map(p => normalizePost(collector.id, p));
        const { data: upserted, error } = await context.supabase
          .from("raw_events").upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true }).select("id, dedupe_hash");
        if (error) throw new Error(`raw_events upsert failed: ${error.message}`);
        postsInserted = upserted?.length ?? 0;
        for (const p of posts) {
          if (!newestPostAt || new Date(p.createdAt) > new Date(newestPostAt)) newestPostAt = p.createdAt;
        }
      }

      // Comments per post (incremental by lastCommentAt)
      for (const post of posts) {
        if (commentsPerPost === 0) break;
        const comments: PhComment[] = [];
        let cAfter: string | null = null;
        let stop = false;
        while (comments.length < commentsPerPost && !stop) {
          const data: { post: { comments: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: Array<{ node: PhComment }> } } | null } =
            await phGraphQL(token, COMMENTS_QUERY, {
              postId: post.id,
              first: Math.min(20, commentsPerPost - comments.length),
              after: cAfter,
            });
          if (!data.post) break;
          for (const e of data.post.comments.edges) {
            const c = e.node;
            if (checkpoint.lastCommentAt && new Date(c.createdAt) <= new Date(checkpoint.lastCommentAt)) { stop = true; break; }
            comments.push(c);
          }
          if (!data.post.comments.pageInfo.hasNextPage) break;
          cAfter = data.post.comments.pageInfo.endCursor;
        }
        commentsFetched += comments.length;
        if (comments.length > 0) {
          const rows = comments.map(c => normalizeComment(collector.id, post, c));
          const { data: upserted, error } = await context.supabase
            .from("raw_events").upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true }).select("id");
          if (error) throw new Error(`comments upsert failed: ${error.message}`);
          commentsInserted += upserted?.length ?? 0;
          for (const c of comments) {
            if (!newestCommentAt || new Date(c.createdAt) > new Date(newestCommentAt)) newestCommentAt = c.createdAt;
          }
        }
      }

      const finishedAt = new Date().toISOString();
      const nextConfig: Config = { ...cfg, checkpoint: { lastPostAt: newestPostAt, lastCommentAt: newestCommentAt } };
      const inserted = postsInserted + commentsInserted;
      await context.supabase.from("collectors").update({
        status: "ok",
        last_success_at: finishedAt,
        config: nextConfig,
        events_collected: (collector.events_collected ?? 0) + inserted,
      }).eq("id", collector.id);
      await log(context.supabase, collector.id, "info", "Sync completed", {
        postsFetched, postsInserted, commentsFetched, commentsInserted, checkpoint: nextConfig.checkpoint,
      });

      return {
        ok: true, startedAt, finishedAt,
        postsFetched, postsInserted, commentsFetched, commentsInserted,
        checkpoint: nextConfig.checkpoint,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await context.supabase.from("collectors").update({ status: "error", last_error: message }).eq("id", collector.id);
      await log(context.supabase, collector.id, "error", "Sync failed", { error: message, postsFetched, postsInserted, commentsFetched, commentsInserted });
      return { ok: false, error: message, postsFetched, postsInserted, commentsFetched, commentsInserted };
    }
  });
