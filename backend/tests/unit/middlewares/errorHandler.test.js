import { jest, describe, it, expect } from '@jest/globals';
import {
  errorHandler,
  notFoundHandler,
  AppError,
} from '../../../src/middlewares/errorHandler.js';

describe('errorHandler 中间件', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('应返回统一错误格式（code、message、details）', () => {
    const err = new AppError(400, 'INVALID_EMAIL_FORMAT', '邮箱格式错误', {
      email: 'bad',
    });
    const res = mockRes();

    errorHandler(err, {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVALID_EMAIL_FORMAT',
      message: '邮箱格式错误',
      details: { email: 'bad' },
    });
  });

  it('未知错误应返回 500 和默认错误信息', () => {
    const err = new Error('unexpected');
    const res = mockRes();

    errorHandler(err, {}, res, () => {});

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'unexpected',
      details: {},
    });
  });

  it('AppError 应正确设置所有属性', () => {
    const err = new AppError(409, 'EMAIL_EXISTS', '邮箱已注册');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('EMAIL_EXISTS');
    expect(err.message).toBe('邮箱已注册');
    expect(err.details).toEqual({});
    expect(err.name).toBe('AppError');
    expect(err instanceof Error).toBe(true);
  });
});

describe('notFoundHandler 中间件', () => {
  it('应返回 404 和标准格式', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    notFoundHandler({}, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      code: 'NOT_FOUND',
      message: '请求的资源不存在',
      details: {},
    });
  });
});
