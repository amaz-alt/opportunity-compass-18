import crypto from 'node:crypto';

const PLATFORM = 'producthunt';

function hash(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

export function normalizePost(collectorId, post) {
  const externalId = `post:${post.id}`;
  const dedupeHash = hash(PLATFORM, externalId);
  return {
    collector_id: collectorId,
    platform: PLATFORM,
    external_id: externalId,
    source_url: post.url,
    author: post.user?.username || post.user?.name || null,
    title: post.name,
    content: [post.tagline, post.description].filter(Boolean).join('\n\n'),
    dedupe_hash: dedupeHash,
    metadata: {
      kind: 'post',
      slug: post.slug,
      website: post.website,
      votes_count: post.votesCount,
      comments_count: post.commentsCount,
      created_at: post.createdAt,
      featured_at: post.featuredAt,
      thumbnail: post.thumbnail?.url || null,
      media: post.media || [],
      hunter: post.user
        ? { id: post.user.id, name: post.user.name, username: post.user.username, headline: post.user.headline }
        : null,
      makers: (post.makers || []).map((m) => ({
        id: m.id, name: m.name, username: m.username, headline: m.headline,
      })),
      topics: (post.topics?.edges || []).map((e) => ({
        id: e.node.id, name: e.node.name, slug: e.node.slug,
      })),
    },
  };
}

export function normalizeComment(collectorId, post, comment) {
  const externalId = `comment:${comment.id}`;
  const dedupeHash = hash(PLATFORM, externalId);
  return {
    collector_id: collectorId,
    platform: PLATFORM,
    external_id: externalId,
    source_url: comment.url || post.url,
    author: comment.user?.username || comment.user?.name || null,
    title: `Comment on ${post.name}`,
    content: comment.body,
    dedupe_hash: dedupeHash,
    metadata: {
      kind: 'comment',
      post_id: post.id,
      post_slug: post.slug,
      post_name: post.name,
      votes_count: comment.votesCount,
      created_at: comment.createdAt,
      user: comment.user
        ? { id: comment.user.id, name: comment.user.name, username: comment.user.username, headline: comment.user.headline }
        : null,
    },
  };
}
