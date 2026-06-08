/**
 * 照片上传服务单元测试
 * 测试格式验证、大小验证、分辨率验证、数量上限和删除功能
 */
import { jest } from '@jest/globals';
import {
  detectMimeType,
  getJpegDimensions,
  getPngDimensions,
  getImageDimensions,
  validatePhoto,
  getPhotoCount,
  uploadPhoto,
  deletePhoto,
  MAX_FILE_SIZE,
  MIN_RESOLUTION,
  MAX_PHOTOS,
} from '../../../src/services/photoService.js';
import { createMockPrismaClient } from '../../helpers/mockFactory.js';

// 辅助函数：创建有效的 JPEG buffer
function createJpegBuffer(width = 400, height = 400) {
  // 最小有效 JPEG: SOI + SOF0 marker with dimensions
  const buf = Buffer.alloc(20);
  // SOI
  buf[0] = 0xff;
  buf[1] = 0xd8;
  // SOF0 marker
  buf[2] = 0xff;
  buf[3] = 0xc0;
  // Segment length (包含自身2字节)
  buf.writeUInt16BE(17, 4); // length = 17
  // Precision
  buf[6] = 8;
  // Height
  buf.writeUInt16BE(height, 7);
  // Width
  buf.writeUInt16BE(width, 9);
  return buf;
}

// 辅助函数：创建有效的 PNG buffer
function createPngBuffer(width = 400, height = 400) {
  // PNG 签名 + IHDR chunk
  const buf = Buffer.alloc(33);
  // PNG 签名
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  // IHDR chunk length (13 bytes)
  buf.writeUInt32BE(13, 8);
  // IHDR type
  buf.write('IHDR', 12);
  // Width
  buf.writeUInt32BE(width, 16);
  // Height
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe('PhotoService', () => {
  describe('detectMimeType', () => {
    it('应正确识别 JPEG 格式', () => {
      const buffer = createJpegBuffer();
      expect(detectMimeType(buffer)).toBe('image/jpeg');
    });

    it('应正确识别 PNG 格式', () => {
      const buffer = createPngBuffer();
      expect(detectMimeType(buffer)).toBe('image/png');
    });

    it('应对不支持的格式返回 null', () => {
      const buffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]); // GIF
      expect(detectMimeType(buffer)).toBeNull();
    });

    it('应对空 buffer 返回 null', () => {
      expect(detectMimeType(null)).toBeNull();
      expect(detectMimeType(Buffer.alloc(0))).toBeNull();
      expect(detectMimeType(Buffer.alloc(3))).toBeNull();
    });
  });

  describe('getJpegDimensions', () => {
    it('应正确读取 JPEG 尺寸', () => {
      const buffer = createJpegBuffer(800, 600);
      const dims = getJpegDimensions(buffer);
      expect(dims).toEqual({ width: 800, height: 600 });
    });

    it('应对无效 buffer 返回 null', () => {
      expect(getJpegDimensions(null)).toBeNull();
      expect(getJpegDimensions(Buffer.alloc(2))).toBeNull();
    });
  });

  describe('getPngDimensions', () => {
    it('应正确读取 PNG 尺寸', () => {
      const buffer = createPngBuffer(1024, 768);
      const dims = getPngDimensions(buffer);
      expect(dims).toEqual({ width: 1024, height: 768 });
    });

    it('应对无效 buffer 返回 null', () => {
      expect(getPngDimensions(null)).toBeNull();
      expect(getPngDimensions(Buffer.alloc(10))).toBeNull();
    });

    it('应对宽高为0的 PNG 返回 null', () => {
      const buffer = createPngBuffer(0, 0);
      expect(getPngDimensions(buffer)).toBeNull();
    });
  });

  describe('validatePhoto', () => {
    it('应接受有效的 JPEG 照片', () => {
      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 1024,
      };
      const result = validatePhoto(file);
      expect(result.mimeType).toBe('image/jpeg');
      expect(result.width).toBe(500);
      expect(result.height).toBe(500);
    });

    it('应接受有效的 PNG 照片', () => {
      const file = {
        buffer: createPngBuffer(300, 300),
        size: 2048,
      };
      const result = validatePhoto(file);
      expect(result.mimeType).toBe('image/png');
      expect(result.width).toBe(300);
      expect(result.height).toBe(300);
    });

    it('应拒绝空文件', () => {
      expect(() => validatePhoto(null)).toThrow('请上传照片文件');
      expect(() => validatePhoto({})).toThrow('请上传照片文件');
    });

    it('应拒绝超过5MB的文件', () => {
      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 6 * 1024 * 1024,
      };
      expect(() => validatePhoto(file)).toThrow('照片文件大小不能超过5MB');
    });

    it('应拒绝不支持的格式', () => {
      const file = {
        buffer: Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00, 0x00, 0x00]),
        size: 100,
      };
      expect(() => validatePhoto(file)).toThrow('照片格式不支持');
    });

    it('应拒绝分辨率低于300×300的照片', () => {
      const file = {
        buffer: createJpegBuffer(200, 400),
        size: 1024,
      };
      expect(() => validatePhoto(file)).toThrow('照片分辨率不能低于300×300像素');
    });

    it('应拒绝高度低于300的照片', () => {
      const file = {
        buffer: createPngBuffer(400, 200),
        size: 1024,
      };
      expect(() => validatePhoto(file)).toThrow('照片分辨率不能低于300×300像素');
    });

    it('应接受恰好300×300分辨率的照片（边界值）', () => {
      const file = {
        buffer: createJpegBuffer(300, 300),
        size: 1024,
      };
      const result = validatePhoto(file);
      expect(result.width).toBe(300);
      expect(result.height).toBe(300);
    });

    it('应拒绝宽度299的照片（边界值）', () => {
      const file = {
        buffer: createJpegBuffer(299, 400),
        size: 1024,
      };
      expect(() => validatePhoto(file)).toThrow('照片分辨率不能低于300×300像素');
    });

    it('应接受恰好5MB的文件（边界值）', () => {
      const file = {
        buffer: createJpegBuffer(500, 500),
        size: MAX_FILE_SIZE, // 恰好5MB
      };
      const result = validatePhoto(file);
      expect(result.mimeType).toBe('image/jpeg');
    });

    it('应在 size 字段缺失时使用 buffer.length 判断大小', () => {
      // 创建一个超大 buffer（模拟超过5MB）
      const bigBuffer = Buffer.alloc(MAX_FILE_SIZE + 1);
      // 设置 JPEG magic bytes
      bigBuffer[0] = 0xff;
      bigBuffer[1] = 0xd8;
      bigBuffer[2] = 0xff;
      const file = { buffer: bigBuffer };
      expect(() => validatePhoto(file)).toThrow('照片文件大小不能超过5MB');
    });
  });

  describe('getPhotoCount', () => {
    it('应返回用户照片数量', async () => {
      const mockPrisma = createMockPrismaClient();
      mockPrisma.photo.count.mockResolvedValue(3);

      const count = await getPhotoCount('user-123', { prismaClient: mockPrisma });
      expect(count).toBe(3);
      expect(mockPrisma.photo.count).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
      });
    });
  });

  describe('uploadPhoto', () => {
    let mockPrisma;

    beforeEach(() => {
      mockPrisma = createMockPrismaClient();
    });

    it('应成功上传有效照片', async () => {
      mockPrisma.photo.count.mockResolvedValue(2);
      mockPrisma.photo.create.mockResolvedValue({
        id: 'photo-1',
        userId: 'user-123',
        url: '/uploads/test.jpg',
        sortOrder: 2,
      });

      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 1024,
        originalname: 'test.jpg',
      };

      const result = await uploadPhoto('user-123', file, { prismaClient: mockPrisma });
      expect(result.id).toBe('photo-1');
      expect(mockPrisma.photo.create).toHaveBeenCalled();
    });

    it('应在达到6张上限时拒绝上传', async () => {
      mockPrisma.photo.count.mockResolvedValue(6);

      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 1024,
      };

      await expect(uploadPhoto('user-123', file, { prismaClient: mockPrisma })).rejects.toThrow(
        '已达到照片数量上限'
      );
    });

    it('应在达到6张上限时返回 PHOTO_LIMIT_REACHED 错误码', async () => {
      mockPrisma.photo.count.mockResolvedValue(6);

      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 1024,
      };

      try {
        await uploadPhoto('user-123', file, { prismaClient: mockPrisma });
        expect(true).toBe(false);
      } catch (err) {
        expect(err.code).toBe('PHOTO_LIMIT_REACHED');
        expect(err.statusCode).toBe(400);
        expect(err.details.maxPhotos).toBe(6);
        expect(err.details.currentCount).toBe(6);
      }
    });

    it('应在已有5张照片时仍允许上传（边界值）', async () => {
      mockPrisma.photo.count.mockResolvedValue(5);
      mockPrisma.photo.create.mockResolvedValue({
        id: 'photo-6',
        userId: 'user-123',
        url: '/uploads/test.jpg',
        sortOrder: 5,
      });

      const file = {
        buffer: createJpegBuffer(500, 500),
        size: 1024,
      };

      const result = await uploadPhoto('user-123', file, { prismaClient: mockPrisma });
      expect(result.id).toBe('photo-6');
      expect(mockPrisma.photo.create).toHaveBeenCalled();
    });

    it('应在文件验证失败时拒绝上传', async () => {
      const file = {
        buffer: Buffer.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
        size: 100,
      };

      await expect(uploadPhoto('user-123', file, { prismaClient: mockPrisma })).rejects.toThrow(
        '照片格式不支持'
      );
    });
  });

  describe('deletePhoto', () => {
    let mockPrisma;

    beforeEach(() => {
      mockPrisma = createMockPrismaClient();
    });

    it('应成功删除自己的照片', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        userId: 'user-123',
        url: '/uploads/abc.jpg',
      });
      mockPrisma.photo.delete.mockResolvedValue({
        id: 'photo-1',
        userId: 'user-123',
        url: '/uploads/abc.jpg',
      });

      const result = await deletePhoto('user-123', 'photo-1', { prismaClient: mockPrisma });
      expect(result.id).toBe('photo-1');
      expect(mockPrisma.photo.delete).toHaveBeenCalledWith({
        where: { id: 'photo-1' },
      });
    });

    it('应拒绝删除不存在的照片', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue(null);

      await expect(deletePhoto('user-123', 'photo-999', { prismaClient: mockPrisma })).rejects.toThrow(
        '照片不存在'
      );
    });

    it('应拒绝删除他人的照片', async () => {
      mockPrisma.photo.findUnique.mockResolvedValue({
        id: 'photo-1',
        userId: 'other-user',
        url: '/uploads/abc.jpg',
      });

      await expect(deletePhoto('user-123', 'photo-1', { prismaClient: mockPrisma })).rejects.toThrow(
        '无权删除此照片'
      );
    });
  });
});
