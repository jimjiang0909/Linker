/// API 相关常量定义
abstract final class ApiConstants {
  // ============ Base URLs ============

  /// 开发环境 API Base URL
  /// 真机调试：使用电脑局域网 IP
  /// 模拟器调试：使用 10.0.2.2（Android）或 localhost（iOS）
  /// adb reverse 调试：使用 localhost（需先执行 adb reverse tcp:3000 tcp:3000）
  static const String devBaseUrl = 'http://localhost:3000/api';

  /// 生产环境 API Base URL
  static const String prodBaseUrl = 'https://linker-api-vcpf.onrender.com/api';

  /// 当前使用的 API Base URL
  static const String baseUrl = prodBaseUrl;

  // ============ WebSocket ============

  /// 开发环境 WebSocket URL
  static const String devWsUrl = 'http://localhost:3000';

  /// 生产环境 WebSocket URL
  static const String prodWsUrl = 'https://linker-api-vcpf.onrender.com';

  /// 当前使用的 WebSocket URL
  static const String wsUrl = prodWsUrl;

  /// 服务器根地址（用于拼接图片等静态资源路径）
  static const String serverUrl = prodWsUrl;

  /// 将相对路径转为完整图片 URL
  static String fullImageUrl(String path) {
    if (path.startsWith('http')) return path;
    return '$serverUrl$path';
  }

  // ============ Timeout ============

  /// 请求超时时间（毫秒）
  static const int connectTimeout = 60000;

  /// 接收超时时间（毫秒）
  static const int receiveTimeout = 60000;

  /// 发送超时时间（毫秒）
  static const int sendTimeout = 30000;

  // ============ Auth Endpoints ============

  /// 发送验证码
  static const String sendCode = '/auth/send-code';

  /// 注册
  static const String register = '/auth/register';

  /// 登录
  static const String login = '/auth/login';

  /// 刷新 Token
  static const String refreshToken = '/auth/refresh';

  /// 获取当前用户信息
  static const String authMe = '/auth/me';

  // ============ Profile Endpoints ============

  /// 用户资料
  static const String profile = '/profile';

  /// 用户照片
  static const String profilePhotos = '/profile/photos';

  /// 删除指定照片
  static String profilePhoto(String photoId) => '/profile/photos/$photoId';

  // ============ Preferences Endpoints ============

  /// 偏好设置
  static const String preferences = '/preferences';

  // ============ Matches Endpoints ============

  /// 每日推荐
  static const String dailyMatches = '/matches/daily';

  /// 标记感兴趣
  static String matchInterested(String matchId) =>
      '/matches/$matchId/interested';

  /// 跳过推荐
  static String matchSkip(String matchId) => '/matches/$matchId/skip';

  // ============ Conversations Endpoints ============

  /// 对话列表
  static const String conversations = '/conversations';

  /// 对话消息
  static String conversationMessages(String conversationId) =>
      '/conversations/$conversationId/messages';

  /// 结束对话
  static String conversationEnd(String conversationId) =>
      '/conversations/$conversationId/end';

  /// 举报对话
  static String conversationReport(String conversationId) =>
      '/conversations/$conversationId/report';

  // ============ Invitations Endpoints ============

  /// 邀请码列表
  static const String invitations = '/invitations';

  /// 已邀请用户列表
  static const String invitees = '/invitations/invitees';
}
