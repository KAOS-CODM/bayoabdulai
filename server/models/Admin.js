import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// Single-admin account (blueprint section 5). No public registration:
// admins are created only by the seed script reading .env credentials.
const adminSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: 254,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalid email address'],
  },
  passwordHash: { type: String, required: true, maxlength: 200 },
  role: { type: String, enum: ['admin'], default: 'admin' },
}, { timestamps: true });

export default model('Admin', adminSchema);
