import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { authenticate } from '../../../src/middlewares/auth.js';

describe('authenticate JWT 中间件', () => {
  const JWT_SECRET = 'test_secret';
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.JWT_SECRET;
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnv;
  });

  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('缺少 Authorization header 应返回 401', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'UNAUTHORIZED',
      message: '缺少认证令牌',
      details: {},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('Authorization header 格式不正确应返回 401', () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'UNAUTHORIZED',
      message: '缺少认证令牌',
      details: {},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('有效 Token 应解码并调用 next', () => {
    const payload = { userId: 'user-123', email: 'test@example.com' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userId).toBe('user-123');
    expect(req.user.email).toBe('test@example.com');
  });

  it('过期 Token 应返回 TOKEN_EXPIRED', () => {
    const payload = { userId: 'user-123' };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '-1s' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'TOKEN_EXPIRED',
      message: '认证令牌已过期',
      details: {},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('无效 Token 应返回 INVALID_TOKEN', () => {
    const req = { headers: { authorization: 'Bearer invalid.token.here' } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVALID_TOKEN',
      message: '无效的认证令牌',
      details: {},
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('使用错误密钥签名的 Token 应返回 INVALID_TOKEN', () => {
    const payload = { userId: 'user-123' };
    const token = jwt.sign(payload, 'wrong_secret', { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      code: 'INVALID_TOKEN',
      message: '无效的认证令牌',
      details: {},
    });
    expect(next).not.toHaveBeenCalled();
  });
});
