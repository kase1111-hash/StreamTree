import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

// Initialize S3 client if credentials are available
const s3Client =
  process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      })
    : null;

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'streamtree-artwork';
const CDN_URL = process.env.CDN_URL; // Optional CloudFront URL

export interface UploadResult {
  key: string;
  url: string;
  hash: string;
}

/**
 * Upload a file to S3
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string,
  folder: string = 'artwork'
): Promise<UploadResult> {
  // Calculate hash for deduplication and integrity
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  // Generate unique key
  const ext = filename.split('.').pop() || 'bin';
  const key = `${folder}/${hash.slice(0, 8)}-${Date.now()}.${ext}`;

  if (!s3Client) {
    // Fallback to local storage for development
    return uploadToLocal(buffer, key, hash);
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000', // 1 year cache
    Metadata: {
      'original-filename': filename,
      'content-hash': hash,
    },
  });

  await s3Client.send(command);

  const url = CDN_URL
    ? `${CDN_URL}/${key}`
    : `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`;

  return { key, url, hash };
}

/**
 * Delete a file from S3
 */
export async function deleteFile(key: string): Promise<void> {
  if (!s3Client) {
    // Local storage delete
    const fs = await import('fs/promises');
    const path = await import('path');
    const localPath = path.join(process.cwd(), 'uploads', key);
    await fs.unlink(localPath).catch(() => {});
    return;
  }

  const command = new DeleteObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  await s3Client.send(command);
}

/**
 * Generate a presigned URL for direct upload
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!s3Client) {
    throw new Error('S3 not configured');
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate a presigned URL for download
 */
export async function getPresignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!s3Client) {
    throw new Error('S3 not configured');
  }

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Fallback local storage for development
 */
async function uploadToLocal(
  buffer: Buffer,
  key: string,
  hash: string
): Promise<UploadResult> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const uploadDir = path.join(process.cwd(), 'uploads');
  const filePath = path.join(uploadDir, key);
  const dirPath = path.dirname(filePath);

  // Ensure directory exists
  await fs.mkdir(dirPath, { recursive: true });

  // Write file
  await fs.writeFile(filePath, buffer);

  // Return local URL
  const url = `/uploads/${key}`;

  return { key, url, hash };
}

/**
 * Validate image file
 */
export function validateImage(
  buffer: Buffer,
  maxSizeBytes: number = 5 * 1024 * 1024 // 5MB default
): { valid: boolean; error?: string; mimeType?: string } {
  // Check size
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File too large. Maximum size is ${Math.round(maxSizeBytes / 1024 / 1024)}MB`,
    };
  }

  // Check magic bytes for image type
  const mimeType = detectImageType(buffer);

  if (!mimeType) {
    return {
      valid: false,
      error: 'Invalid image format. Supported formats: JPEG, PNG, GIF, WebP',
    };
  }

  return { valid: true, mimeType };
}

/**
 * Detect image type from magic bytes
 */
function detectImageType(buffer: Buffer): string | null {
  const signatures: Record<string, number[]> = {
    'image/jpeg': [0xff, 0xd8, 0xff],
    'image/png': [0x89, 0x50, 0x4e, 0x47],
    'image/gif': [0x47, 0x49, 0x46],
    'image/webp': [0x52, 0x49, 0x46, 0x46], // RIFF header
  };

  for (const [mimeType, signature] of Object.entries(signatures)) {
    const matches = signature.every((byte, i) => buffer[i] === byte);
    if (matches) {
      // Additional check for WebP
      if (mimeType === 'image/webp') {
        const webpSignature = buffer.slice(8, 12).toString('ascii');
        if (webpSignature !== 'WEBP') continue;
      }
      return mimeType;
    }
  }

  return null;
}

/**
 * Check if storage is configured
 */
export function isStorageConfigured(): boolean {
  return !!s3Client;
}
