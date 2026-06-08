# Linker 项目逻辑修复需求文档

## 意图分析
- **用户请求**: 查看项目有哪些逻辑是不合理的，或者不完整的，并修复所有问题
- **请求类型**: Bug Fix + Enhancement
- **范围估计**: 多组件（路由、服务、中间件、WebSocket、数据模型、定时任务）
- **复杂度估计**: 中等
- **修复范围**: 全部16个问题（用户选择 C）

---

## 用户决策摘要

| 问题 | 用户选择 | 方案 |
|------|----------|------|
| 修复优先级 | C | 修复所有16个问题 |
| 举报功能 | B | 独立 Report 表 + 累计举报自动暂停用户 |
| 离线消息 | B | PostgreSQL 存储离线消息 |
| Match 双向可见 | B | 为双方各创建 DailyRecommendation 记录 |
| suspended 状态 | A | auth 中间件全局检查 |

---

## 功能需求

### FR-01: 注册流程竞态条件修复
- 将注册流程（邮箱检查 → 验证码验证 → 用户创建 → 邀请码使用）包装在数据库事务中
- 确保并发注册请求不会导致重复用户或邀请码错误消费

### FR-02: 验证码锁定逻辑修复
- 锁定判断基于最后一次失败尝试的时间，而非验证码创建时间
- 确保新请求的验证码不会重置锁定计时器
- 统一 register 和 login 路由的锁定逻辑

### FR-03: 登录路由添加锁定保护
- 在 login 路由中添加与 register 相同的5次错误锁定30分钟机制
- 防止验证码暴力破解攻击

### FR-04: Match 推荐双向可见性
- 推荐生成时，为 userA 和 userB 各创建一条 DailyRecommendation 记录
- 修改 GET /api/matches/daily 接口，根据用户角色（userA 或 userB）返回对方的信息
- 确保双方都能看到推荐详情和对方的 Profile

### FR-05: 每日推荐去重检查
- 在 generateDailyRecommendations 中检查今天是否已为该用户生成过推荐
- 如果已存在，跳过生成并返回已有记录
- 防止 cron job 重复执行导致重复 Match

### FR-06: Profile 状态管理一致性
- 定义清晰的状态流转规则：registered → profile_completed → preference_set
- profile_completed 条件：Profile 数据完整 + 至少1张照片
- 上传照片后检查并推进状态
- 设置偏好前检查用户是否已 profile_completed

### FR-07: 举报功能完善（标准方案）
- 创建独立的 Report 数据模型（reporter, reported user, message, reason, status）
- 添加举报去重：同一用户不能重复举报同一条消息
- 累计举报自动暂停：当一个用户被3个不同用户举报后，自动将其状态设为 suspended
- 修改现有 reportConversation 逻辑使用新的 Report 表

### FR-08: 对话结束后同步 Match 状态
- endConversation 时将关联的 Match 状态更新为 closed
- 确保已结束对话的用户不会出现在后续推荐的排除列表逻辑中（已有 closed 排除）

### FR-09: 离线消息 PostgreSQL 持久化
- 创建 OfflineMessage 数据模型（userId, event, data, timestamp）
- 修改 WebSocket 模块，离线消息写入数据库而非内存
- 用户上线时从数据库读取并推送离线消息，推送后删除
- 保留最大500条限制

### FR-10: 每日推荐性能优化
- 对候选人 AI 评分改为并行执行（使用 Promise.allSettled，并发数限制为5）
- 添加基础的预筛选逻辑（年龄范围、性别偏好）减少 AI 调用次数

### FR-11: CST 时区处理统一
- 创建统一的时区工具函数（如 getTodayCST, getCSTDate）
- 替换所有手动时区计算为统一工具函数
- 确保 matches 路由、rateLimitService、dailyRecommendation 使用相同的时区逻辑

### FR-12: 邀请码生成限制
- 添加用户可用邀请码数量上限检查（如最多持有10个未使用的邀请码）
- 在 generateInvitationCodes 中添加限制逻辑

### FR-13: 照片删除后 sortOrder 重排
- deletePhoto 后重新排列剩余照片的 sortOrder（从0开始连续编号）
- 使用事务确保原子性

### FR-14: WebSocket 心跳检测
- 实现 ping/pong 心跳机制（每30秒 ping，10秒超时）
- 超时未响应的连接自动断开并清理

### FR-15: suspended 状态全局检查
- 在 authenticate 中间件中添加用户状态检查
- suspended 用户的请求返回 403 ACCOUNT_SUSPENDED
- 确保被暂停用户无法访问任何需要认证的 API

### FR-16: suspended 状态与举报联动
- 当用户被3个不同用户举报后自动 suspended
- suspended 用户的活跃 Match 标记为 closed
- suspended 用户的活跃 Conversation 标记为 ended

---

## 非功能需求

### NFR-01: 数据一致性
- 所有涉及多表操作的逻辑必须使用数据库事务
- 竞态条件通过事务隔离级别或唯一约束解决

### NFR-02: 安全性
- 验证码暴力破解保护覆盖所有入口（register + login）
- suspended 用户全局拦截

### NFR-03: 性能
- AI 匹配评分并行化，单用户推荐生成时间从 O(n) 降低
- 离线消息查询添加索引

### NFR-04: 可靠性
- 离线消息持久化，容器重启不丢失
- WebSocket 心跳检测清理僵尸连接

### NFR-05: 可维护性
- 时区处理统一为工具函数
- 状态流转规则集中管理
