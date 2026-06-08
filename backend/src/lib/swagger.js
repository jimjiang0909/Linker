/**
 * Swagger/OpenAPI Documentation Setup
 */
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Linker API',
    version: '1.0.0',
    description: 'Linker MVP - AI驱动的私密社交介绍系统 API 文档',
  },
  servers: [
    {
      url: '/api',
      description: 'API Server',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' },
          details: { type: 'object' },
        },
      },
      Success: {
        type: 'object',
        properties: {
          code: { type: 'string', example: 'SUCCESS' },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
    },
  },
  paths: {
    '/auth/send-code': {
      post: {
        tags: ['Auth'],
        summary: '发送验证码',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: {
                  email: { type: 'string', format: 'email' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '验证码发送成功' },
          400: { description: '邮箱格式错误' },
          429: { description: '请求过于频繁' },
        },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: '注册新用户',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'code', 'invitationCode'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  code: { type: 'string', minLength: 6, maxLength: 6 },
                  invitationCode: { type: 'string', minLength: 8, maxLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: '注册成功' },
          400: { description: '参数错误' },
          409: { description: '邮箱已注册' },
          429: { description: '账号锁定' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: '登录',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'code'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  code: { type: 'string', minLength: 6, maxLength: 6 },
                },
              },
            },
          },
        },
        responses: {
          200: { description: '登录成功' },
          400: { description: '验证码错误' },
          404: { description: '用户不存在' },
          429: { description: '账号锁定' },
        },
      },
    },
    '/profile': {
      get: {
        tags: ['Profile'],
        summary: '获取当前用户资料',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
      put: {
        tags: ['Profile'],
        summary: '更新用户资料',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'birthYear', 'gender', 'occupation', 'city'],
                properties: {
                  name: { type: 'string', maxLength: 20 },
                  birthYear: { type: 'integer' },
                  gender: { type: 'string', enum: ['male', 'female', 'other'] },
                  occupation: { type: 'string', maxLength: 30 },
                  city: { type: 'string', maxLength: 30 },
                  bio: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { 200: { description: '更新成功' } },
      },
    },
    '/profile/photos': {
      post: {
        tags: ['Profile'],
        summary: '上传照片',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  photo: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: { 201: { description: '上传成功' } },
      },
    },
    '/profile/photos/{id}': {
      delete: {
        tags: ['Profile'],
        summary: '删除照片',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: '删除成功' } },
      },
    },
    '/profile/account': {
      delete: {
        tags: ['Profile'],
        summary: '注销账号（删除所有数据）',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '账号已删除' } },
      },
    },
    '/preferences': {
      get: {
        tags: ['Preferences'],
        summary: '获取偏好设置',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
      put: {
        tags: ['Preferences'],
        summary: '更新偏好设置',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['ageMin', 'ageMax', 'datingIntent'],
                properties: {
                  ageMin: { type: 'integer', minimum: 18, maximum: 60 },
                  ageMax: { type: 'integer', minimum: 18, maximum: 60 },
                  datingIntent: { type: 'string', enum: ['serious_dating', 'casual_social', 'make_friends'] },
                  occupationTypes: { type: 'array', items: { type: 'string' }, maxItems: 5 },
                  personalityTraits: { type: 'array', items: { type: 'string' }, maxItems: 5 },
                },
              },
            },
          },
        },
        responses: { 200: { description: '保存成功' } },
      },
    },
    '/matches/daily': {
      get: {
        tags: ['Matches'],
        summary: '获取每日推荐',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/matches/{id}/interested': {
      post: {
        tags: ['Matches'],
        summary: '表达感兴趣',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/matches/{id}/skip': {
      post: {
        tags: ['Matches'],
        summary: '跳过推荐',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/conversations': {
      get: {
        tags: ['Conversations'],
        summary: '获取对话列表',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/conversations/{id}/messages': {
      get: {
        tags: ['Conversations'],
        summary: '获取消息历史（分页）',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20, maximum: 50 } },
        ],
        responses: { 200: { description: '成功' } },
      },
      post: {
        tags: ['Conversations'],
        summary: '发送消息（HTTP fallback）',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: { type: 'string', maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: { 201: { description: '发送成功' } },
      },
    },
    '/conversations/{id}/end': {
      post: {
        tags: ['Conversations'],
        summary: '结束对话',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: '对话已结束' } },
      },
    },
    '/conversations/{id}/report': {
      post: {
        tags: ['Conversations'],
        summary: '举报消息',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messageId', 'reason'],
                properties: {
                  messageId: { type: 'string', format: 'uuid' },
                  reason: { type: 'string', maxLength: 500 },
                },
              },
            },
          },
        },
        responses: { 201: { description: '举报已提交' } },
      },
    },
    '/conversations/{id}/read': {
      post: {
        tags: ['Conversations'],
        summary: '标记消息为已读',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  lastReadMessageId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: { 200: { description: '标记成功' } },
      },
    },
    '/invitations': {
      get: {
        tags: ['Invitations'],
        summary: '获取我的邀请码',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/invitations/invitees': {
      get: {
        tags: ['Invitations'],
        summary: '获取已邀请用户列表',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: '成功' } },
      },
    },
    '/invitations/validate': {
      post: {
        tags: ['Invitations'],
        summary: '验证邀请码',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['code'],
                properties: {
                  code: { type: 'string', minLength: 8, maxLength: 8 },
                },
              },
            },
          },
        },
        responses: { 200: { description: '邀请码有效' } },
      },
    },
  },
};

const specs = swaggerJsdoc({ swaggerDefinition, apis: [] });

/**
 * Setup Swagger UI
 * @param {import('express').Application} app
 */
export function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Linker API Documentation',
  }));
}
