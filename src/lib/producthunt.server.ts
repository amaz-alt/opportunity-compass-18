import crypto from "node:crypto";

const PLATFORM = "producthunt";
const COLLECTOR_NAME = "Product Hunt";
const PH_ENDPOINT = "https://api.producthunt.com/v2/api/graphql";

type SupabaseLike = {
  from: (table: string) => any;
};

function sha256(...parts: string[]) {
  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

type PhPost = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  slug: string;
  url: string;
  website?: string;
  votesCount: number;
  commentsCount: number;
  createdAt: string;
  featuredAt?: string;
  user?: { id: string; name: string; username: string; headline?: string };
  makers?: Array<{ id: string; name: string; username: string; headline?: string }>;
  topics?: { edges: Array<{ node: { id: string; name: string; slug: string } }> };
  media?: Array<{ url: string; type: string }>;
  thumbnail?: { url: string };
};

type PhComment = {
  id: string;
  body: string;
  createdAt: string;
  votesCount: number;
  url?: string;
  user?: { id: string; name: string; username: string; headline?: string };
};

export type ProductHuntConfig = {
  pollIntervalMinutes?: number;
  postsPerSync?: number;
  commentsPerPost?: number;
  checkpoint?: { lastPostAt?: string | null; lastCommentAt?: string | null };
};

export const PRODUCT_HUNT_DEFAULTS = { pollIntervalMinutes: 30, postsPerSync: 20, commentsPerPost: 25 };

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
  if (!res.ok) throw new Error(`Product Hunt API ${res.status}: ${text.slice(0, 500)}`);

  let json: { data?: T; errors?: unknown };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
  }
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
      kind: "post",
      slug: post.slug,
      website: post.website ?? null,
      votes_count: post.votesCount,
      comments_count: post.commentsCount,
      created_at: post.createdAt,
      featured_at: post.featuredAt ?? null,
      thumbnail: post.thumbnail?.url ?? null,
      media: post.media ?? [],
      hunter: post.user ?? null,
      makers: post.makers ?? [],
      topics: (post.topics?.edges ?? []).map((e) => e.node),
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
      kind: "comment",
      post_id: post.id,
      post_slug: post.slug,
      post_name: post.name,
      votes_count: comment.votesCount,
      created_at: comment.createdAt,
      user: comment.user ?? null,
    },
  };
}

export async function ensureProductHuntCollector(supabase: SupabaseLike) {
  const { data: existing, error: selErr } = await supabase.from("collectors").select("*").eq("platform", PLATFORM).maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;

  const { data, error } = await supabase
    .from("collectors")
    .insert({ name: COLLECTOR_NAME, platform: PLATFORM, enabled: false, config: PRODUCT_HUNT_DEFAULTS, schedule: null, status: "idle" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function logProductHunt(supabase: SupabaseLike, collectorId: string, level: "info" | "warn" | "error", message: string, metadata: Record<string, unknown> = {}) {
  await supabase.from("collector_logs").insert({ collector_id: collectorId, level, message, metadata });
}

export async function testProductHuntToken(supabase: SupabaseLike, token: string | undefined) {
  const collector = await ensureProductHuntCollector(supabase);
  if (!token) {
    await logProductHunt(supabase, collector.id, "error", "Test connection failed: PRODUCT_HUNT_TOKEN not set");
    return { ok: false as const, error: "PRODUCT_HUNT_TOKEN is not configured." };
  }

  try {
    const data = await phGraphQL<{ posts: { edges: Array<{ node: PhPost }> } }>(token, POSTS_QUERY, { first: 1, after: null, postedAfter: null });
    const node = data.posts.edges[0]?.node;
    await logProductHunt(supabase, collector.id, "info", "Test connection succeeded", { sample_post: node?.slug });
    return {
      ok: true as const,
      sample: node ? { id: node.id, name: node.name, slug: node.slug, url: node.url, votesCount: node.votesCount, createdAt: node.createdAt } : null,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logProductHunt(supabase, collector.id, "error", "Test connection failed", { error: message });
    return { ok: false as const, error: message };
  }
}

export async function runProductHuntSyncCore(supabase: SupabaseLike, token: string | undefined) {
  const collector = await ensureProductHuntCollector(supabase);
  if (!token) {
    await logProductHunt(supabase, collector.id, "error", "Sync aborted: PRODUCT_HUNT_TOKEN not set");
    return { ok: false as const, error: "PRODUCT_HUNT_TOKEN is not configured.", postsFetched: 0, postsInserted: 0, commentsFetched: 0, commentsInserted: 0 };
  }

  const cfg: ProductHuntConfig = { ...PRODUCT_HUNT_DEFAULTS, ...(collector.config as ProductHuntConfig) };
  const postsPerSync = cfg.postsPerSync ?? PRODUCT_HUNT_DEFAULTS.postsPerSync;
  const commentsPerPost = cfg.commentsPerPost ?? PRODUCT_HUNT_DEFAULTS.commentsPerPost;
  const checkpoint = cfg.checkpoint ?? {};
  const startedAt = new Date().toISOString();

  await supabase.from("collectors").update({ status: "running", last_run_at: startedAt, last_error: null }).eq("id", collector.id);
  await logProductHunt(supabase, collector.id, "info", "Sync started", { postsPerSync, commentsPerPost, checkpoint });

  let postsFetched = 0;
  let postsInserted = 0;
  let commentsFetched = 0;
  let commentsInserted = 0;
  let newestPostAt = checkpoint.lastPostAt ?? null;
  let newestCommentAt = checkpoint.lastCommentAt ?? null;

  try {
    const posts: PhPost[] = [];
    let after: string | null = null;
    while (posts.length < postsPerSync) {
      const data: { posts: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: Array<{ node: PhPost }> } } = await phGraphQL(token, POSTS_QUERY, {
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
      const rows = posts.map((p) => normalizePost(collector.id, p));
      const { data: upserted, error } = await supabase.from("raw_events").upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true }).select("id, dedupe_hash");
      if (error) throw new Error(`raw_events upsert failed: ${error.message}`);
      postsInserted = upserted?.length ?? 0;
      for (const p of posts) {
        if (!newestPostAt || new Date(p.createdAt) > new Date(newestPostAt)) newestPostAt = p.createdAt;
      }
    }

    for (const post of posts) {
      if (commentsPerPost === 0) break;
      const comments: PhComment[] = [];
      let cAfter: string | null = null;
      let stop = false;
      while (comments.length < commentsPerPost && !stop) {
        const data: { post: { comments: { pageInfo: { hasNextPage: boolean; endCursor: string }; edges: Array<{ node: PhComment }> } } | null } = await phGraphQL(token, COMMENTS_QUERY, {
          postId: post.id,
          first: Math.min(20, commentsPerPost - comments.length),
          after: cAfter,
        });
        if (!data.post) break;
        for (const e of data.post.comments.edges) {
          const c = e.node;
          if (checkpoint.lastCommentAt && new Date(c.createdAt) <= new Date(checkpoint.lastCommentAt)) {
            stop = true;
            break;
          }
          comments.push(c);
        }
        if (!data.post.comments.pageInfo.hasNextPage) break;
        cAfter = data.post.comments.pageInfo.endCursor;
      }
      commentsFetched += comments.length;
      if (comments.length > 0) {
        const rows = comments.map((c) => normalizeComment(collector.id, post, c));
        const { data: upserted, error } = await supabase.from("raw_events").upsert(rows, { onConflict: "dedupe_hash", ignoreDuplicates: true }).select("id");
        if (error) throw new Error(`comments upsert failed: ${error.message}`);
        commentsInserted += upserted?.length ?? 0;
        for (const c of comments) {
          if (!newestCommentAt || new Date(c.createdAt) > new Date(newestCommentAt)) newestCommentAt = c.createdAt;
        }
      }
    }

    const finishedAt = new Date().toISOString();
    const nextConfig: ProductHuntConfig = { ...cfg, checkpoint: { lastPostAt: newestPostAt, lastCommentAt: newestCommentAt } };
    const inserted = postsInserted + commentsInserted;
    await supabase
      .from("collectors")
      .update({ status: "ok", last_success_at: finishedAt, config: nextConfig, events_collected: (collector.events_collected ?? 0) + inserted })
      .eq("id", collector.id);
    await logProductHunt(supabase, collector.id, "info", "Sync completed", { postsFetched, postsInserted, commentsFetched, commentsInserted, checkpoint: nextConfig.checkpoint });

    return { ok: true as const, startedAt, finishedAt, postsFetched, postsInserted, commentsFetched, commentsInserted, checkpoint: nextConfig.checkpoint };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await supabase.from("collectors").update({ status: "error", last_error: message }).eq("id", collector.id);
    await logProductHunt(supabase, collector.id, "error", "Sync failed", { error: message, postsFetched, postsInserted, commentsFetched, commentsInserted });
    return { ok: false as const, error: message, postsFetched, postsInserted, commentsFetched, commentsInserted };
  }
}

export function isProductHuntDue(collector: { enabled: boolean; status?: string | null; last_run_at?: string | null; config?: ProductHuntConfig | null }) {
  if (!collector.enabled) return { due: false, reason: "collector disabled" };
  const cfg: ProductHuntConfig = { ...PRODUCT_HUNT_DEFAULTS, ...(collector.config ?? {}) };
  const intervalMs = Math.max(1, cfg.pollIntervalMinutes ?? PRODUCT_HUNT_DEFAULTS.pollIntervalMinutes) * 60_000;
  if (collector.status === "running" && collector.last_run_at && Date.now() - new Date(collector.last_run_at).getTime() < 15 * 60_000) {
    return { due: false, reason: "previous run still marked running" };
  }
  if (!collector.last_run_at) return { due: true, reason: "never run" };
  const elapsed = Date.now() - new Date(collector.last_run_at).getTime();
  return elapsed >= intervalMs ? { due: true, reason: "poll interval elapsed" } : { due: false, reason: "poll interval not reached" };
}

export { PLATFORM as PRODUCT_HUNT_PLATFORM };