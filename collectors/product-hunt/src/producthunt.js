import { config } from './config.js';
import { withRetry } from './retry.js';

const ENDPOINT = 'https://api.producthunt.com/v2/api/graphql';

async function graphql(query, variables) {
  return withRetry(async () => {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.productHuntToken}`,
        'User-Agent': 'signal-collector-producthunt/1.0',
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Product Hunt API ${res.status}: ${text.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (json.errors?.length) {
      throw new Error(`Product Hunt GraphQL error: ${JSON.stringify(json.errors).slice(0, 300)}`);
    }
    return json.data;
  }, { label: 'ph-graphql' });
}

const POSTS_QUERY = `
  query Posts($first: Int!, $after: String, $postedAfter: DateTime) {
    posts(first: $first, after: $after, order: NEWEST, postedAfter: $postedAfter) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          tagline
          description
          slug
          url
          website
          votesCount
          commentsCount
          createdAt
          featuredAt
          user { id name username headline }
          makers { id name username headline }
          topics(first: 10) { edges { node { id name slug } } }
          media { url type }
          thumbnail { url }
        }
      }
    }
  }
`;

const COMMENTS_QUERY = `
  query Comments($postId: ID!, $first: Int!, $after: String) {
    post(id: $postId) {
      comments(first: $first, after: $after, order: NEWEST) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            body
            createdAt
            votesCount
            url
            user { id name username headline }
          }
        }
      }
    }
  }
`;

export async function fetchNewPosts({ postedAfter, limit }) {
  const posts = [];
  let after = null;
  while (posts.length < limit) {
    const data = await graphql(POSTS_QUERY, {
      first: Math.min(20, limit - posts.length),
      after,
      postedAfter: postedAfter || undefined,
    });
    const edges = data.posts.edges;
    for (const e of edges) posts.push(e.node);
    if (!data.posts.pageInfo.hasNextPage) break;
    after = data.posts.pageInfo.endCursor;
  }
  return posts.slice(0, limit);
}

export async function fetchComments(postId, { limit, since }) {
  const comments = [];
  let after = null;
  while (comments.length < limit) {
    const data = await graphql(COMMENTS_QUERY, {
      postId,
      first: Math.min(20, limit - comments.length),
      after,
    });
    const post = data.post;
    if (!post) break;
    for (const e of post.comments.edges) {
      const c = e.node;
      if (since && new Date(c.createdAt) <= new Date(since)) {
        return comments; // sorted NEWEST → we can stop
      }
      comments.push(c);
    }
    if (!post.comments.pageInfo.hasNextPage) break;
    after = post.comments.pageInfo.endCursor;
  }
  return comments;
}
