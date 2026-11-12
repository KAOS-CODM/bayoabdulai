import { v2 as cloudinary } from 'cloudinary';

// All secrets stay server-side; the client ever sees only secure_url + public_id.
export function configureCloudinary({ cloudName, apiKey, apiSecret }) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

// Backend-mediated signed upload (audit 9.2 / 11): PNG/JPEG/WebP only (enforced
// by the upload middleware), 5 MB cap, own folder, auto quality/format delivery
// (derived assets drop EXIF), never overwrite another asset's public id.
export function uploadImage(buffer, { folder = 'bayo-portfolio' } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'image',
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        overwrite: false,
        unique_filename: true,
      },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
    stream.end(buffer);
  });
}

// Returns { result: 'ok' | 'not found' | ... }; callers treat 'not found'
// as idempotent success.
export function destroyImage(publicId) {
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
}
