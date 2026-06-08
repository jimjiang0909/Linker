import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/constants/app_sizes.dart';
import '../../core/constants/app_strings.dart';
import '../../core/router/app_routes.dart';
import '../../features/conversations/providers/conversations_provider.dart';
import '../providers/unread_count_provider.dart';

/// 主页面底部导航栏 Shell 组件
///
/// 包含三个标签：推荐、消息、我的。
/// 作为 ShellRoute 的 builder，接收子页面 [child] 并在底部展示导航栏。
/// 根据当前路由路径高亮对应标签，点击标签使用 GoRouter.go 切换页面。
class MainShell extends ConsumerWidget {
  const MainShell({super.key, required this.child});

  /// ShellRoute 传入的子页面
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final unreadCount = ref.watch(unreadCountProvider);

    // 首次进入主页时加载对话列表以获取未读数
    ref.listen(conversationsProvider, (previous, next) {});
    final conversationsState = ref.read(conversationsProvider);
    if (conversationsState is AsyncLoading) {
      Future.microtask(() {
        ref.read(conversationsProvider.notifier).fetchConversations();
      });
    }

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: _calculateSelectedIndex(context),
        onDestinationSelected: (index) => _onItemTapped(index, context),
        destinations: [
          const NavigationDestination(
            icon: Icon(Icons.favorite_outline),
            selectedIcon: Icon(Icons.favorite),
            label: AppStrings.navRecommendation,
          ),
          NavigationDestination(
            icon: _buildMessageIcon(Icons.chat_bubble_outline, unreadCount),
            selectedIcon: _buildMessageIcon(Icons.chat_bubble, unreadCount),
            label: AppStrings.navMessages,
          ),
          const NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: AppStrings.navMe,
          ),
        ],
      ),
    );
  }

  /// 构建带未读角标的消息图标
  Widget _buildMessageIcon(IconData iconData, int unreadCount) {
    if (unreadCount <= 0) {
      return Icon(iconData);
    }

    return Badge(
      label: Text(
        unreadCount > 99 ? '99+' : '$unreadCount',
        style: const TextStyle(
          color: AppColors.textWhite,
          fontSize: AppSizes.fontXs,
          fontWeight: FontWeight.w600,
        ),
      ),
      backgroundColor: AppColors.badge,
      child: Icon(iconData),
    );
  }

  /// 根据当前路由路径计算选中的标签索引
  int _calculateSelectedIndex(BuildContext context) {
    final location = GoRouterState.of(context).uri.path;
    if (location.startsWith(AppRoutes.matches)) return 0;
    if (location.startsWith(AppRoutes.conversations)) return 1;
    if (location.startsWith(AppRoutes.me)) return 2;
    return 0;
  }

  /// 点击标签时切换到对应页面
  void _onItemTapped(int index, BuildContext context) {
    switch (index) {
      case 0:
        GoRouter.of(context).go(AppRoutes.matches);
      case 1:
        GoRouter.of(context).go(AppRoutes.conversations);
      case 2:
        GoRouter.of(context).go(AppRoutes.me);
    }
  }
}
