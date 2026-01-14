import { v2 as cloudinary } from 'cloudinary';
import { logger } from './logger';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  bytes: number;
}

export async function uploadToCloudinary(
  filePath: string,
  folder: string = 'licenses'
): Promise<UploadResult> {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: `serene-spa/${folder}`,
      resource_type: 'auto',
      allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
      max_bytes: 10 * 1024 * 1024,
    });

    logger.info('File uploaded to Cloudinary', {
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    logger.error('Cloudinary upload error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    throw error;
  }
}

export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === 'ok';
  } catch (error) {
    logger.error('Cloudinary delete error', {
      error: error instanceof Error ? error.message : 'Unknown',
      publicId,
    });
    return false;
  }
}

export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}
