/// 路由路径常量定义
class AppRoutes {
  AppRoutes._();

  static const String splash = '/splash';
  static const String auth = '/auth';
  static const String profileSetup = '/profile/setup';
  static const String preferencesSetup = '/preferences/setup';

  // ShellRoute 内的标签页
  static const String matches = '/matches';
  static const String conversations = '/conversations';
  static const String me = '/me';

  // 独立页面
  static const String chat = '/conversations/:id';
  static const String profileEdit = '/profile/edit';
  static const String preferencesEdit = '/preferences/edit';
  static const String invitations = '/invitations';
  static const String invitees = '/invitees';

  /// 生成聊天详情页路径
  static String chatPath(String conversationId) =>
      '/conversations/$conversationId';
}
