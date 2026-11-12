import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const MAX_DEPTH = 14;

export function isHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const httpUrl = z.string().trim().max(2048)
  .refine(isHttpUrl, 'must be an http:// or https:// URL');

// Media URLs may be absolute (Cloudinary) or root-relative (existing static assets).
const mediaUrl = z.string().trim().max(2048)
  .refine((v) => v.startsWith('/') || isHttpUrl(v), 'must be an http(s) URL or a root-relative path like /assets/...');

const mediaUrlOrEmpty = z.string().trim().max(2048)
  .refine((v) => v === '' || v.startsWith('/') || isHttpUrl(v), 'must be empty, an http(s) URL, or a root-relative path');

const slugString = z.string().trim().toLowerCase().max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase words separated by single hyphens');

// Guards against adversarially deep nesting (blueprint section 5: nesting validation).
function depthOf(value, depth = 0) {
  if (depth > MAX_DEPTH) return depth;
  if (Array.isArray(value)) {
    return value.reduce((max, item) => Math.max(max, depthOf(item, depth + 1)), depth);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).reduce((max, item) => Math.max(max, depthOf(item, depth + 1)), depth);
  }
  return depth;
}

const depthGuard = (val, ctx) => {
  if (depthOf(val) > MAX_DEPTH) {
    ctx.addIssue({
      code: 'custom',
      path: [],
      message: `content nested deeper than ${MAX_DEPTH} levels`,
    });
  }
};

// ---------------------------------------------------------------------------
// Rich text: inline nodes (recursive) and blocks
// ---------------------------------------------------------------------------

const inline = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: z.string().max(5000) }),
  z.object({ type: z.literal('bold'), content: z.array(inline).max(50) }),
  z.object({ type: z.literal('italic'), content: z.array(inline).max(50) }),
  z.object({ type: z.literal('underline'), content: z.array(inline).max(50) }),
  z.object({ type: z.literal('code'), text: z.string().max(2000) }),
  z.object({ type: z.literal('link'), href: httpUrl, content: z.array(inline).max(50) }),
]));

const block = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('heading'),
    level: z.number().int().min(2).max(4),
    content: z.array(inline).min(1).max(50),
  }),
  z.object({ type: z.literal('paragraph'), content: z.array(inline).min(1).max(50) }),
  z.object({
    type: z.literal('list'),
    ordered: z.boolean().default(false),
    items: z.array(z.array(inline).min(1).max(50)).min(1).max(50),
  }),
  z.object({ type: z.literal('blockquote'), content: z.array(inline).min(1).max(50) }),
  z.object({
    type: z.literal('code'),
    language: z.string().max(30).optional(),
    code: z.string().min(1).max(10000),
  }),
]);

// ---------------------------------------------------------------------------
// Sections (blueprint section 5: nine supported types)
// ---------------------------------------------------------------------------

const ratio = z.enum(['16:10', '4:3', '3:4', '1:1', '9:16', 'auto']);
const titled = { title: z.string().trim().max(120).optional() };

const section = z.discriminatedUnion('type', [
  z.object({ type: z.literal('richText'), ...titled, blocks: z.array(block).min(1).max(40) }),

  z.object({
    type: z.literal('imageGallery'),
    ...titled,
    images: z.array(z.object({
      url: mediaUrl,
      publicId: z.string().max(200).optional(),
      alt: z.string().max(200).default(''),
      caption: z.string().max(300).optional(),
      ratio: ratio.optional(),
    })).min(1).max(30),
  }),

  z.object({
    type: z.literal('statistics'),
    ...titled,
    items: z.array(z.object({
      value: z.string().trim().min(1).max(20),
      label: z.string().trim().min(1).max(80),
      note: z.string().max(160).optional(),
    })).min(1).max(12),
  }),

  z.object({
    type: z.literal('checklist'),
    ...titled,
    items: z.array(z.string().trim().min(1).max(300)).min(1).max(50),
  }),

  z.object({
    type: z.literal('keyModules'),
    ...titled,
    items: z.array(z.object({
      title: z.string().trim().min(1).max(100),
      description: z.string().max(500).optional(),
    })).min(1).max(20),
  }),

  z.object({
    type: z.literal('beforeAfter'),
    ...titled,
    before: z.object({ url: mediaUrl, alt: z.string().max(200).default(''), label: z.string().max(60).optional() }),
    after: z.object({ url: mediaUrl, alt: z.string().max(200).default(''), label: z.string().max(60).optional() }),
    note: z.string().max(300).optional(),
  }),

  z.object({
    type: z.literal('processSteps'),
    ...titled,
    steps: z.array(z.object({
      title: z.string().trim().min(1).max(100),
      description: z.string().max(800).optional(),
      image: z.object({ url: mediaUrl, alt: z.string().max(200).default('') }).optional(),
    })).min(1).max(20),
  }),

  z.object({
    type: z.literal('linkCard'),
    ...titled,
    heading: z.string().trim().min(1).max(120),
    text: z.string().max(400).optional(),
    links: z.array(z.object({
      label: z.string().trim().min(1).max(60),
      url: httpUrl,
    })).min(1).max(6),
  }),

  z.object({
    type: z.literal('videoEmbed'),
    ...titled,
    provider: z.enum(['youtube', 'vimeo']), // approved-provider allowlist (section 5)
    videoId: z.string().regex(/^[A-Za-z0-9_-]{5,30}$/, 'invalid video id'),
    caption: z.string().max(300).optional(),
  }),
]);

// Render-time re-validation (Phase 5): the dynamic project page re-parses
// sections/blocks defensively so manually-edited DB records fail safely.
export const blockSchema = block;
export const sectionSchema = section;

// ---------------------------------------------------------------------------
// Sub-collections
// ---------------------------------------------------------------------------

const mediaItem = z.object({
  url: mediaUrl,
  publicId: z.string().max(200).default(''),
  alt: z.string().max(200).default(''),
  caption: z.string().max(300).default(''),
  ratio: ratio.default('16:10'),
  sort: z.number().int().min(0).default(0),
});

const linkItem = z.object({
  label: z.string().trim().min(1).max(60),
  url: httpUrl,
  kind: z.enum(['prototype', 'live', 'github', 'other']).default('other'),
});

const seo = z.object({
  title: z.string().trim().max(70).default(''),
  description: z.string().trim().max(170).default(''),
  canonical: z.string().trim().max(2048).default(''),
  image: mediaUrlOrEmpty.default(''),
  imageAlt: z.string().max(200).default(''),
});

// ---------------------------------------------------------------------------
// Project payloads
// ---------------------------------------------------------------------------

const tagList = z.array(z.string().trim().min(1).max(40)).max(20);
const toolList = z.array(z.string().trim().min(1).max(60)).max(30);
const objectiveList = z.array(z.string().trim().min(1).max(300)).max(20);
const blockList = z.array(block).max(40);
const sectionList = z.array(section).max(30);
const mediaList = z.array(mediaItem).max(50);
const linkList = z.array(linkItem).max(10);

// Create: missing fields get safe defaults.
export const projectCreateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: slugString.optional(),
  shortDescription: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(60),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  featured: z.boolean().default(false),
  displayOrder: z.number().int().min(0).max(100000).default(0),
  tags: tagList.default([]),
  role: z.string().trim().max(120).default(''),
  duration: z.string().trim().max(80).default(''),
  tools: toolList.default([]),
  objectives: objectiveList.default([]),
  overview: blockList.default([]),
  sections: sectionList.default([]),
  media: mediaList.default([]),
  links: linkList.default([]),
  seo: seo.default({}),
}).superRefine(depthGuard);

// Update: only provided fields are written (status/featured/order are preserved
// when omitted - "Save Changes" must not flip publication state). `version`
// enables optimistic concurrency (blueprint section 9).
export const projectUpdateSchema = z.object({
  title: z.string().trim().min(1).max(120),
  shortDescription: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(60),
  slug: slugString.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  featured: z.boolean().optional(),
  displayOrder: z.number().int().min(0).max(100000).optional(),
  tags: tagList.optional(),
  role: z.string().trim().max(120).optional(),
  duration: z.string().trim().max(80).optional(),
  tools: toolList.optional(),
  objectives: objectiveList.optional(),
  overview: blockList.optional(),
  sections: sectionList.optional(),
  media: mediaList.optional(),
  links: linkList.optional(),
  seo: seo.optional(),
  version: z.number().int().min(1),
}).superRefine(depthGuard);

export const statusPatchSchema = z.object({ status: z.enum(['draft', 'published', 'archived']) });
export const featuredPatchSchema = z.object({ featured: z.boolean() });
export const orderPatchSchema = z.object({ displayOrder: z.number().int().min(0).max(100000) });
