/**
 * Photo Upload Service
 * Handles photo format validation, size validation, resolution validation, count limit check, storage, and deletion
 */
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import prisma from '../lib/prisma.js';
import { AppError } from '../middlewares/errorHandler.js';

// Configuration constants
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MIN_RESOLUTION = 300; // Minimum width/height 300px
const MAX_PHOTOS = 6; // Max 6 photos
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

// JPEG and PNG magic bytes
const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Detect MIME type from file buffer magic bytes
 * @param {Buffer} buffer - File content
 * @returns {string|null} MIME type or null
 */
export function detectMimeType(buffer) {
  if (!buffer || buffer.length < 8) {
    return null;
  }

  // Check JPEG: FF D8 FF
  if (buffer[0] === JPEG_MAGIC[0] && buffer[1] === JPEG_MAGIC[1] && buffer[2] === JPEG_MAGIC[2]) {
    return 'image/jpeg';
  }

  // Check PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === PNG_MAGIC[0] &&
    buffer[1] === PNG_MAGIC[1] &&
    buffer[2] === PNG_MAGIC[2] &&
    buffer[3] === PNG_MAGIC[3] &&
    buffer[4] === PNG_MAGIC[4] &&
    buffer[5] === PNG_MAGIC[5] &&
    buffer[6] === PNG_MAGIC[6] &&
    buffer[7] === PNG_MAGIC[7]
  ) {
    return 'image/png';
  }

  return null;
}

/**
 * Read image dimensions from JPEG buffer
 * Parses JPEG SOF (Start of Frame) marker to get width and height
 * @param {Buffer} buffer - JPEG file content
 * @returns {{width: number, height: number}|null}
 */
export function getJpegDimensions(buffer) {
  if (!buffer || buffer.length < 4) return null;

  let offset = 2; // Skip SOI marker (FF D8)

  while (offset < buffer.length - 1) {
    // Find marker prefix 0xFF
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      // SOF structure: FF Cx [length:2] [precision:1] [height:2] [width:2]
      if (offset + 9 > buffer.length) return null;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip current segment
    if (marker === 0xd0 || marker === 0xd1 || marker === 0xd2 || marker === 0xd3 ||
        marker === 0xd4 || marker === 0xd5 || marker === 0xd6 || marker === 0xd7 ||
        marker === 0xd8 || marker === 0xd9 || marker === 0x01) {
      // Markers without length field
      offset += 2;
    } else {
      // Markers with length field
      if (offset + 3 >= buffer.length) return null;
      const segmentLength = buffer.readUInt16BE(offset + 2);
      offset += 2 + segmentLength;
    }
  }

  return null;
}

/**
 * Read image dimensions from PNG buffer
 * PNG IHDR chunk contains width and height info (after file header)
 * @param {Buffer} buffer - PNG file content
 * @returns {{width: number, height: number}|null}
 */
export function getPngDimensions(buffer) {
  // PNG structure: 8-byte signature + IHDR chunk
  // IHDR chunk: [length:4] [type:4 "IHDR"] [width:4] [height:4] ...
  if (!buffer || buffer.length < 24) return null;

  // IHDR data starts at offset 16 (8 signature + 4 length + 4 type)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width === 0 || height === 0) return null;

  return { width, height };
}

/**
 * Get image dimensions (supports JPEG and PNG)
 * @param {Buffer} buffer - File content
 * @param {string} mimeType - MIME type
 * @returns {{width: number, height: number}|null}
 */
export function getImageDimensions(buffer, mimeType) {
  if (mimeType === 'image/jpeg') {
    return getJpegDimensions(buffer);
  }
  if (mimeType === 'image/png') {
    return getPngDimensions(buffer);
  }
  return null;
}

/**
 * Validate photo file
 * Checks format (JPEG/PNG), size (≤5MB), resolution (≥300×300)
 *
 * @param {object} file - Uploaded file object
 * @param {Buffer} file.buffer - File content
 * @param {number} file.size - File size (bytes)
 * @param {string} [file.originalname] - Original filename
 * @returns {{mimeType: string, width: number, height: number}} File info after validation
 * @throws {AppError} Throws specific error on validation failure
 */
export function validatePhoto(file) {
  if (!file || !file.buffer) {
    throw new AppError(400, 'INVALID_PHOTO', 'Please upload a photo file');
  }

  // 1. Validate file size
  const fileSize = file.size || file.buffer.length;
  if (fileSize > MAX_FILE_SIZE) {
    throw new AppError(400, 'PHOTO_TOO_LARGE', 'Photo file size cannot exceed 5MB', {
      maxSize: MAX_FILE_SIZE,
      actualSize: fileSize,
    });
  }

  // 2. Validate file format (via magic bytes detection)
  const mimeType = detectMimeType(file.buffer);
  if (!mimeType) {
    throw new AppError(400, 'UNSUPPORTED_FORMAT', 'Unsupported photo format. Only JPEG and PNG are supported.');
  }

  // 3. Validate resolution
  const dimensions = getImageDimensions(file.buffer, mimeType);
  if (!dimensions) {
    throw new AppError(400, 'INVALID_IMAGE', 'Cannot read photo dimensions. Please ensure the file is not corrupted.');
  }

  if (dimensions.width < MIN_RESOLUTION || dimensions.height < MIN_RESOLUTION) {
    throw new AppError(400, 'RESOLUTION_TOO_LOW', 'Photo resolution cannot be lower than 300x300 pixels', {
      minResolution: `${MIN_RESOLUTION}x${MIN_RESOLUTION}`,
      actualResolution: `${dimensions.width}x${dimensions.height}`,
    });
  }

  return { mimeType, width: dimensions.width, height: dimensions.height };
}

/**
 * Get user's current photo count
 * @param {string} userId - User ID
 * @param {object} [deps] - Injectable dependencies
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<number>} Photo count
 */
export async function getPhotoCount(userId, deps = {}) {
  const db = deps.prismaClient || prisma;
  return db.photo.count({ where: { userId } });
}

/**
 * Upload photo
 * Validate file → check count limit → store file → create database record
 *
 * @param {string} userId - User ID
 * @param {object} file - Uploaded file object
 * @param {object} [deps] - Injectable dependencies
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Created photo record
 * @throws {AppError} Throws error on validation failure or limit reached
 */
export async function uploadPhoto(userId, file, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Validate photo file
  const { mimeType } = validatePhoto(file);

  // 2. Check photo count limit
  const currentCount = await getPhotoCount(userId, deps);
  if (currentCount >= MAX_PHOTOS) {
    throw new AppError(400, 'PHOTO_LIMIT_REACHED', 'Photo limit reached (max 6 photos)', {
      maxPhotos: MAX_PHOTOS,
      currentCount,
    });
  }

  // 3. Store file to local filesystem
  const extension = mimeType === 'image/jpeg' ? '.jpg' : '.png';
  const filename = `${randomUUID()}${extension}`;
  const uploadDir = path.resolve(UPLOAD_DIR);
  const filePath = path.join(uploadDir, filename);

  // Ensure upload directory exists
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(filePath, file.buffer);

  // 4. Create database record
  const photo = await db.photo.create({
    data: {
      userId,
      url: `/uploads/${filename}`,
      sortOrder: currentCount,
    },
  });

  return photo;
}

/**
 * Delete photo
 * Verify ownership → delete file → delete database record
 *
 * @param {string} userId - User ID
 * @param {string} photoId - Photo ID
 * @param {object} [deps] - Injectable dependencies
 * @param {object} [deps.prismaClient] - Prisma client instance
 * @returns {Promise<object>} Deleted photo record
 * @throws {AppError} Throws error if photo not found or no permission
 */
export async function deletePhoto(userId, photoId, deps = {}) {
  const db = deps.prismaClient || prisma;

  // 1. Find photo and verify ownership
  const photo = await db.photo.findUnique({
    where: { id: photoId },
  });

  if (!photo) {
    throw new AppError(404, 'PHOTO_NOT_FOUND', 'Photo not found');
  }

  if (photo.userId !== userId) {
    throw new AppError(403, 'FORBIDDEN', 'Permission denied to delete this photo');
  }

  // 2. Delete local file (with path traversal protection)
  const filename = path.basename(photo.url);
  const uploadDir = path.resolve(UPLOAD_DIR);
  const filePath = path.join(uploadDir, filename);

  // Verify the resolved path is within the upload directory
  if (!filePath.startsWith(uploadDir)) {
    throw new AppError(400, 'INVALID_PATH', 'Invalid file path detected');
  }

  try {
    await fs.unlink(filePath);
  } catch (err) {
    // Don't block deletion flow if file doesn't exist, just log warning
    if (err.code !== 'ENOENT') {
      console.error('[PhotoService] Failed to delete file:', err.message);
    }
  }

  // 3. Delete database record
  await db.photo.delete({
    where: { id: photoId },
  });

  // 4. Reorder remaining photos (FR-13: continuous sortOrder from 0)
  const remainingPhotos = await db.photo.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  });

  for (let i = 0; i < remainingPhotos.length; i++) {
    if (remainingPhotos[i].sortOrder !== i) {
      await db.photo.update({
        where: { id: remainingPhotos[i].id },
        data: { sortOrder: i },
      });
    }
  }

  return photo;
}

// Export constants for testing
export { MAX_FILE_SIZE, MIN_RESOLUTION, MAX_PHOTOS, UPLOAD_DIR };
