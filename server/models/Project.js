import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const STATUSES = ['draft', 'published', 'archived'];
export const MEDIA_RATIOS = ['16:10', '4:3', '3:4', '1:1', '9:16', 'auto'];

const mediaSchema = new Schema({
  url: { type: String, required: true, maxlength: 2048 },
  publicId: { type: String, default: '', maxlength: 200 },
  alt: { type: String, default: '', maxlength: 200 },
  caption: { type: String, default: '', maxlength: 300 },
  ratio: { type: String, enum: MEDIA_RATIOS, default: '16:10' },
  sort: { type: Number, default: 0, min: 0 },
}, { _id: false });

const linkSchema = new Schema({
  label: { type: String, required: true, trim: true, maxlength: 60 },
  url: { type: String, required: true, maxlength: 2048 },
  kind: { type: String, enum: ['prototype', 'live', 'github', 'other'], default: 'other' },
}, { _id: false });

const seoSchema = new Schema({
  title: { type: String, default: '', maxlength: 70 },
  description: { type: String, default: '', maxlength: 170 },
  canonical: { type: String, default: '', maxlength: 2048 },
  image: { type: String, default: '', maxlength: 2048 },
  imageAlt: { type: String, default: '', maxlength: 200 },
}, { _id: false });

const projectSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 160,
    match: [/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase words separated by single hyphens'],
  },
  shortDescription: { type: String, required: true, trim: true, maxlength: 300 },
  category: { type: String, required: true, trim: true, maxlength: 60 },
  status: { type: String, enum: STATUSES, default: 'draft' },
  featured: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0, min: 0 },
  tags: [{ type: String, trim: true, maxlength: 40 }],
  role: { type: String, default: '', trim: true, maxlength: 120 },
  duration: { type: String, default: '', trim: true, maxlength: 80 },
  tools: [{ type: String, trim: true, maxlength: 60 }],
  objectives: [{ type: String, trim: true, maxlength: 300 }],
  // Structured JSON validated by zod at the API boundary (blueprint section 5).
  // Unsafe HTML is never stored: rich text = typed blocks, sections = typed objects.
  overview: { type: [Schema.Types.Mixed], default: [] },
  sections: { type: [Schema.Types.Mixed], default: [] },
  media: { type: [mediaSchema], default: [] },
  links: { type: [linkSchema], default: [] },
  seo: { type: seoSchema, default: () => ({}) },
  version: { type: Number, default: 1, min: 1 },
}, { timestamps: true });

projectSchema.index({ status: 1, displayOrder: 1 });
projectSchema.index({ status: 1, featured: 1 });
projectSchema.index({ status: 1, category: 1 });

export default model('Project', projectSchema);
