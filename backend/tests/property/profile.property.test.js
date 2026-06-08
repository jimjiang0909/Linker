/**
 * 资料模块属性测试
 * 使用 fast-check 验证 Profile 字段校验和照片上传验证的正确性属性
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
 */
import { describe, it, expect } from '@jest/globals';
import fc from 'fast-check';
import {
  validProfileArb,
  validNameArb,
  invalidNameArb,
  validBirthYearArb,
  invalidBirthYearArb,
  genderArb,
  validOccupationArb,
  validCityArb,
  validBioArb,
  invalidBioArb,
} from '../helpers/index.js';
import { validateProfileFields } from '../../src/services/profileService.js';
import { validatePhoto } from '../../src/services/photoService.js';

// ============================================================
// 照片相关生成器
// ============================================================

// JPEG magic bytes: FF D8 FF
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

// PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 创建一个有效的 JPEG buffer（包含 SOF 标记以提供尺寸信息）
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {Buffer}
 */
function createJpegBuffer(width, height) {
  // JPEG 结构: SOI + APP0 + SOF0 + EOI
  // SOI: FF D8
  // SOF0: FF C0 [length:2] [precision:1] [height:2] [width:2] [components...]
  const sof0Length = 11; // 2(length) + 1(precision) + 2(height) + 2(width) + 1(numComponents) + 3(component)
  const buf = Buffer.alloc(20);
  let offset = 0;

  // SOI
  buf[offset++] = 0xff;
  buf[offset++] = 0xd8;

  // SOF0 marker
  buf[offset++] = 0xff;
  buf[offset++] = 0xc0;

  // SOF0 length (包含自身2字节)
  buf.writeUInt16BE(sof0Length, offset);
  offset += 2;

  // Precision
  buf[offset++] = 8;

  // Height
  buf.writeUInt16BE(height, offset);
  offset += 2;

  // Width
  buf.writeUInt16BE(width, offset);
  offset += 2;

  // Number of components
  buf[offset++] = 3;

  // Component data (3 bytes per component, 3 components = 9 bytes, but we only need minimal)
  buf[offset++] = 1; // component id
  buf[offset++] = 0x11; // sampling factor
  buf[offset++] = 0; // quantization table

  return buf;
}

/**
 * 创建一个有效的 PNG buffer（包含 IHDR chunk 以提供尺寸信息）
 * @param {number} width - 图片宽度
 * @param {number} height - 图片高度
 * @returns {Buffer}
 */
function createPngBuffer(width, height) {
  // PNG 结构: 8字节签名 + IHDR chunk
  // IHDR: [length:4] [type:4 "IHDR"] [width:4] [height:4] [bitDepth:1] [colorType:1] [compression:1] [filter:1] [interlace:1] [crc:4]
  const buf = Buffer.alloc(33);
  let offset = 0;

  // PNG signature
  buf[offset++] = 0x89;
  buf[offset++] = 0x50;
  buf[offset++] = 0x4e;
  buf[offset++] = 0x47;
  buf[offset++] = 0x0d;
  buf[offset++] = 0x0a;
  buf[offset++] = 0x1a;
  buf[offset++] = 0x0a;

  // IHDR chunk length (13 bytes of data)
  buf.writeUInt32BE(13, offset);
  offset += 4;

  // IHDR type
  buf.write('IHDR', offset);
  offset += 4;

  // Width
  buf.writeUInt32BE(width, offset);
  offset += 4;

  // Height
  buf.writeUInt32BE(height, offset);
  offset += 4;

  // Bit depth, color type, compression, filter, interlace
  buf[offset++] = 8; // bit depth
  buf[offset++] = 2; // color type (RGB)
  buf[offset++] = 0; // compression
  buf[offset++] = 0; // filter
  buf[offset++] = 0; // interlace

  return buf;
}

/**
 * 有效照片文件生成器（JPEG 或 PNG，≤5MB，≥300×300）
 */
const validPhotoArb = fc
  .tuple(
    fc.constantFrom('jpeg', 'png'),
    fc.integer({ min: 300, max: 4000 }), // width
    fc.integer({ min: 300, max: 4000 }), // height
    fc.integer({ min: 1, max: 5 * 1024 * 1024 }) // size ≤ 5MB
  )
  .map(([format, width, height, size]) => {
    const buffer = format === 'jpeg'
      ? createJpegBuffer(width, height)
      : createPngBuffer(width, height);
    return {
      buffer,
      size: Math.min(size, buffer.length), // 实际 size 使用 buffer 长度（小文件）
      originalname: `photo.${format === 'jpeg' ? 'jpg' : 'png'}`,
      _expectedWidth: width,
      _expectedHeight: height,
      _expectedFormat: format,
    };
  });

/**
 * 无效格式照片生成器（非 JPEG/PNG 的 magic bytes）
 */
const invalidFormatPhotoArb = fc
  .tuple(
    fc.integer({ min: 10, max: 1000 }), // buffer size
  )
  .map(([bufSize]) => {
    // 创建一个不是 JPEG 也不是 PNG 的 buffer（GIF magic bytes: 47 49 46 38）
    const buf = Buffer.alloc(bufSize);
    buf[0] = 0x47; // G
    buf[1] = 0x49; // I
    buf[2] = 0x46; // F
    buf[3] = 0x38; // 8
    return {
      buffer: buf,
      size: bufSize,
      originalname: 'photo.gif',
    };
  });

/**
 * 超大文件照片生成器（>5MB）
 */
const oversizedPhotoArb = fc
  .tuple(
    fc.constantFrom('jpeg', 'png'),
    fc.integer({ min: 300, max: 4000 }),
    fc.integer({ min: 300, max: 4000 }),
    fc.integer({ min: 5 * 1024 * 1024 + 1, max: 10 * 1024 * 1024 }) // size > 5MB
  )
  .map(([format, width, height, size]) => {
    const buffer = format === 'jpeg'
      ? createJpegBuffer(width, height)
      : createPngBuffer(width, height);
    return {
      buffer,
      size, // 报告的 size 超过 5MB
      originalname: `photo.${format === 'jpeg' ? 'jpg' : 'png'}`,
    };
  });

/**
 * 低分辨率照片生成器（<300×300）
 */
const lowResolutionPhotoArb = fc
  .tuple(
    fc.constantFrom('jpeg', 'png'),
    fc.integer({ min: 1, max: 299 }), // width < 300
    fc.integer({ min: 1, max: 299 }), // height < 300
  )
  .map(([format, width, height]) => {
    const buffer = format === 'jpeg'
      ? createJpegBuffer(width, height)
      : createPngBuffer(width, height);
    return {
      buffer,
      size: buffer.length,
      originalname: `photo.${format === 'jpeg' ? 'jpg' : 'png'}`,
      _expectedWidth: width,
      _expectedHeight: height,
    };
  });

// ============================================================
// 属性测试
// ============================================================

describe('Feature: linker-mvp, Property 4: Profile 字段校验的正确性', () => {
  /**
   * **Validates: Requirements 2.1, 2.2, 2.6, 2.7, 2.8**
   *
   * 对于任意 Profile 数据，当且仅当所有必填字段均存在且满足校验规则时，
   * 系统应保存成功；否则应拒绝并返回具体的校验错误信息。
   */

  it('所有必填字段存在且满足校验规则时，校验应通过（无错误）', () => {
    fc.assert(
      fc.property(validProfileArb, (profile) => {
        const errors = validateProfileFields(profile);
        expect(errors).toEqual([]);
      }),
      { numRuns: 100 }
    );
  });

  it('缺少必填字段时，校验应返回对应字段的错误信息', () => {
    const requiredFields = ['name', 'birthYear', 'gender', 'occupation', 'city'];

    fc.assert(
      fc.property(
        validProfileArb,
        fc.subarray(requiredFields, { minLength: 1 }),
        (profile, fieldsToRemove) => {
          // 移除选定的必填字段
          const incompleteProfile = { ...profile };
          for (const field of fieldsToRemove) {
            delete incompleteProfile[field];
          }

          const errors = validateProfileFields(incompleteProfile);

          // 应该有错误
          expect(errors.length).toBeGreaterThan(0);

          // 每个被移除的字段都应该在错误列表中
          for (const field of fieldsToRemove) {
            const fieldError = errors.find((e) => e.field === field);
            expect(fieldError).toBeDefined();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('姓名超过20字符时，校验应返回姓名错误', () => {
    fc.assert(
      fc.property(
        validProfileArb,
        invalidNameArb.filter((n) => n.length > 20),
        (profile, invalidName) => {
          const data = { ...profile, name: invalidName };
          const errors = validateProfileFields(data);
          const nameError = errors.find((e) => e.field === 'name');
          expect(nameError).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('出生年份使年龄不在18-60岁之间时，校验应返回出生年份错误', () => {
    fc.assert(
      fc.property(
        validProfileArb,
        invalidBirthYearArb,
        (profile, invalidBirthYear) => {
          const data = { ...profile, birthYear: invalidBirthYear };
          const errors = validateProfileFields(data);
          const birthYearError = errors.find((e) => e.field === 'birthYear');
          expect(birthYearError).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('性别不是预定义选项时，校验应返回性别错误', () => {
    const invalidGenderArb = fc
      .string({ minLength: 1, maxLength: 10 })
      .filter((g) => !['男', '女', '其他', 'male', 'female', 'other'].includes(g));

    fc.assert(
      fc.property(
        validProfileArb,
        invalidGenderArb,
        (profile, invalidGender) => {
          const data = { ...profile, gender: invalidGender };
          const errors = validateProfileFields(data);
          const genderError = errors.find((e) => e.field === 'gender');
          expect(genderError).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('自我介绍超过500字符时，校验应返回 bio 错误', () => {
    fc.assert(
      fc.property(
        validProfileArb,
        invalidBioArb,
        (profile, invalidBio) => {
          const data = { ...profile, bio: invalidBio };
          const errors = validateProfileFields(data);
          const bioError = errors.find((e) => e.field === 'bio');
          expect(bioError).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('校验是确定性的：相同输入总是产生相同结果', () => {
    fc.assert(
      fc.property(validProfileArb, (profile) => {
        const errors1 = validateProfileFields(profile);
        const errors2 = validateProfileFields(profile);
        expect(errors1).toEqual(errors2);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Feature: linker-mvp, Property 5: 照片上传验证的正确性', () => {
  /**
   * **Validates: Requirements 2.3, 2.4, 2.5**
   *
   * 对于任意照片上传请求，当且仅当照片格式为 JPEG 或 PNG、文件大小≤5MB、
   * 分辨率≥300×300像素、且用户当前照片数量<6时，系统应接受上传；
   * 否则应拒绝并返回具体错误原因。
   */

  it('有效照片（JPEG/PNG、≤5MB、≥300×300）应通过验证', () => {
    fc.assert(
      fc.property(validPhotoArb, (photo) => {
        const result = validatePhoto(photo);
        // 应返回验证信息而非抛出错误
        expect(result).toBeDefined();
        expect(result.mimeType).toMatch(/^image\/(jpeg|png)$/);
        expect(result.width).toBeGreaterThanOrEqual(300);
        expect(result.height).toBeGreaterThanOrEqual(300);
      }),
      { numRuns: 100 }
    );
  });

  it('不支持的格式（非 JPEG/PNG）应被拒绝', () => {
    fc.assert(
      fc.property(invalidFormatPhotoArb, (photo) => {
        expect(() => validatePhoto(photo)).toThrow();
        try {
          validatePhoto(photo);
        } catch (err) {
          expect(err.code).toBe('UNSUPPORTED_FORMAT');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('超过5MB的文件应被拒绝', () => {
    fc.assert(
      fc.property(oversizedPhotoArb, (photo) => {
        expect(() => validatePhoto(photo)).toThrow();
        try {
          validatePhoto(photo);
        } catch (err) {
          expect(err.code).toBe('PHOTO_TOO_LARGE');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('分辨率低于300×300的照片应被拒绝', () => {
    fc.assert(
      fc.property(lowResolutionPhotoArb, (photo) => {
        expect(() => validatePhoto(photo)).toThrow();
        try {
          validatePhoto(photo);
        } catch (err) {
          expect(err.code).toBe('RESOLUTION_TOO_LOW');
        }
      }),
      { numRuns: 100 }
    );
  });

  it('空文件或无 buffer 应被拒绝', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(null, undefined, {}, { buffer: null }, { buffer: undefined }),
        (invalidFile) => {
          expect(() => validatePhoto(invalidFile)).toThrow();
          try {
            validatePhoto(invalidFile);
          } catch (err) {
            expect(err.code).toBe('INVALID_PHOTO');
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('验证是确定性的：相同输入总是产生相同结果', () => {
    fc.assert(
      fc.property(validPhotoArb, (photo) => {
        const result1 = validatePhoto(photo);
        const result2 = validatePhoto(photo);
        expect(result1).toEqual(result2);
      }),
      { numRuns: 100 }
    );
  });
});
