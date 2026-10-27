// src/content.config.ts — the /writing posts.
// Write a post: add a .md file to src/content/writing/ with the frontmatter below.
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const BLOGS = {
  ai: { name: 'AI', blurb: 'The concepts, and the projects that use them.' },
  ai2: { name: '(AI)²', blurb: "Austin's Intelligence × Artificial Intelligence. Music, visuals, art." },
  culture: { name: 'Culture', blurb: 'My takes.' },
} as const;

const writing = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/writing' }),
  schema: z.object({
    title: z.string(),
    blog: z.enum(['ai', 'ai2', 'culture']),
    date: z.coerce.date(),
    summary: z.string(),
    // set for pieces that live on their own page (e.g. /intelligence); the card links there
    href: z.string().optional(),
    // projects this post explains or uses, shown under the post
    projects: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
    // drafts show in `npm run dev` only
    draft: z.boolean().default(false),
  }),
});

export const collections = { writing };
