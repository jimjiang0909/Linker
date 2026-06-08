import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/network/app_exception.dart';
import '../../../core/network/websocket_client.dart';
import '../../../core/router/app_routes.dart';
import '../../../shared/models/daily_match.dart';
import '../providers/matches_provider.dart';

/// 每日推荐页面
///
/// 展示每日推荐卡片堆叠，支持左右滑动操作。
/// 监听 WebSocket match:success 事件展示匹配成功弹窗。
class DailyMatchesPage extends ConsumerStatefulWidget {
  const DailyMatchesPage({super.key});

  @override
  ConsumerState<DailyMatchesPage> createState() => _DailyMatchesPageState();
}

class _DailyMatchesPageState extends ConsumerState<DailyMatchesPage> {
  StreamSubscription<MatchSuccessEvent>? _matchSuccessSubscription;

  @override
  void initState() {
    super.initState();
    // 进入页面时自动获取推荐列表
    Future.microtask(() {
      ref.read(dailyMatchesProvider.notifier).fetchDailyMatches();
    });
    // 监听 WebSocket match:success 事件
    _listenMatchSuccess();
  }

  void _listenMatchSuccess() {
    final wsClient = ref.read(webSocketClientProvider);
    _matchSuccessSubscription = wsClient.onMatchSuccess.listen((event) {
      if (mounted) {
        _showMatchSuccessDialog(event);
      }
    });
  }

  @override
  void dispose() {
    _matchSuccessSubscription?.cancel();
    super.dispose();
  }

  void _showMatchSuccessDialog(MatchSuccessEvent event) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => _MatchSuccessDialog(
        partnerName: 'Your match',
        onStartChat: () {
          Navigator.of(dialogContext).pop();
          context.push(AppRoutes.chatPath(event.conversationId));
        },
      ),
    );
  }

  Future<void> _handleInterested(String matchId) async {
    try {
      await ref.read(dailyMatchesProvider.notifier).markInterested(matchId);
    } on AppException catch (e) {
      if (e.code == 'DAILY_LIMIT_REACHED' && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(AppStrings.dailyLimitReached),
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    } catch (_) {
      // 其他错误由全局错误处理器处理
    }
  }

  Future<void> _handleSkip(String matchId) async {
    try {
      await ref.read(dailyMatchesProvider.notifier).skip(matchId);
    } catch (_) {
      // 错误由全局错误处理器处理
    }
  }

  @override
  Widget build(BuildContext context) {
    final matchesState = ref.watch(dailyMatchesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.dailyRecommendation),
        centerTitle: true,
      ),
      body: matchesState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => _ErrorView(
          onRetry: () {
            ref.read(dailyMatchesProvider.notifier).fetchDailyMatches();
          },
        ),
        data: (matches) {
          if (matches.isEmpty) {
            return const _EmptyStateView();
          }
          return _MatchCardStack(
            matches: matches,
            onInterested: _handleInterested,
            onSkip: _handleSkip,
          );
        },
      ),
    );
  }
}

/// 卡片堆叠展示组件
///
/// 展示推荐卡片堆叠效果，顶部卡片支持滑动操作。
class _MatchCardStack extends StatelessWidget {
  final List<DailyMatch> matches;
  final Future<void> Function(String matchId) onInterested;
  final Future<void> Function(String matchId) onSkip;

  const _MatchCardStack({
    required this.matches,
    required this.onInterested,
    required this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Stack(
        children: [
          // 背景卡片（最多展示2张叠加效果）
          if (matches.length > 1)
            Positioned.fill(
              child: Transform.translate(
                offset: const Offset(0, 10),
                child: Transform.scale(
                  scale: 0.95,
                  child: _MatchCardContent(
                    match: matches[1],
                    interactive: false,
                  ),
                ),
              ),
            ),
          // 顶部可交互卡片
          Positioned.fill(
            child: _SwipeableMatchCard(
              key: ValueKey(matches.first.id),
              match: matches.first,
              onInterested: () => onInterested(matches.first.id),
              onSkip: () => onSkip(matches.first.id),
            ),
          ),
        ],
      ),
    );
  }
}

/// 可滑动的匹配卡片
///
/// 支持左右滑动手势，左滑跳过、右滑感兴趣。
/// 滑动时卡片有旋转和透明度变化效果。
class _SwipeableMatchCard extends StatefulWidget {
  final DailyMatch match;
  final VoidCallback onInterested;
  final VoidCallback onSkip;

  const _SwipeableMatchCard({
    super.key,
    required this.match,
    required this.onInterested,
    required this.onSkip,
  });

  @override
  State<_SwipeableMatchCard> createState() => _SwipeableMatchCardState();
}

class _SwipeableMatchCardState extends State<_SwipeableMatchCard>
    with SingleTickerProviderStateMixin {
  double _dragX = 0;
  double _dragY = 0;
  bool _isDragging = false;

  static const double _swipeThreshold = 100;
  static const double _maxRotation = 0.3; // radians

  @override
  Widget build(BuildContext context) {
    final screenWidth = MediaQuery.of(context).size.width;
    final progress = (_dragX / screenWidth).clamp(-1.0, 1.0);
    final rotation = progress * _maxRotation;
    final opacity = (1 - progress.abs() * 0.5).clamp(0.5, 1.0);

    return GestureDetector(
      onPanStart: (_) {
        setState(() => _isDragging = true);
      },
      onPanUpdate: (details) {
        setState(() {
          _dragX += details.delta.dx;
          _dragY += details.delta.dy;
        });
      },
      onPanEnd: (details) {
        _isDragging = false;
        if (_dragX > _swipeThreshold) {
          // 右滑 - 感兴趣
          widget.onInterested();
        } else if (_dragX < -_swipeThreshold) {
          // 左滑 - 跳过
          widget.onSkip();
        } else {
          // 回弹
          setState(() {
            _dragX = 0;
            _dragY = 0;
          });
        }
      },
      child: AnimatedContainer(
        duration: _isDragging
            ? Duration.zero
            : const Duration(milliseconds: 300),
        curve: Curves.easeOut,
        transform: Matrix4.identity()
          ..setTranslationRaw(_dragX, _dragY, 0)
          ..rotateZ(rotation),
        transformAlignment: Alignment.center,
        child: Opacity(
          opacity: opacity,
          child: Stack(
            children: [
              _MatchCardContent(
                match: widget.match,
                interactive: true,
                onInterested: widget.onInterested,
                onSkip: widget.onSkip,
              ),
              // 滑动方向指示器
              if (_dragX > 30)
                Positioned(
                  top: 40,
                  left: 20,
                  child: _SwipeIndicator(
                    text: AppStrings.interested,
                    color: Colors.green,
                    icon: Icons.favorite,
                  ),
                ),
              if (_dragX < -30)
                Positioned(
                  top: 40,
                  right: 20,
                  child: _SwipeIndicator(
                    text: AppStrings.skip,
                    color: Colors.red,
                    icon: Icons.close,
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// 滑动方向指示器
class _SwipeIndicator extends StatelessWidget {
  final String text;
  final Color color;
  final IconData icon;

  const _SwipeIndicator({
    required this.text,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        border: Border.all(color: color, width: 3),
        borderRadius: BorderRadius.circular(8),
        color: color.withValues(alpha: 0.1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 4),
          Text(
            text,
            style: TextStyle(
              color: color,
              fontSize: 18,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ),
    );
  }
}

/// 匹配卡片内容组件
///
/// 展示照片、姓名、年龄、职业、城市、匹配分数和 AI 推荐理由。
class _MatchCardContent extends StatelessWidget {
  final DailyMatch match;
  final bool interactive;
  final VoidCallback? onInterested;
  final VoidCallback? onSkip;

  const _MatchCardContent({
    required this.match,
    required this.interactive,
    this.onInterested,
    this.onSkip,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 照片区域
          Expanded(
            flex: 3,
            child: Stack(
              fit: StackFit.expand,
              children: [
                _buildPhoto(),
                // 匹配分数标签
                Positioned(
                  top: 12,
                  right: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: _getScoreColor(match.score),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${match.score}',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
          // 信息区域
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 姓名和年龄
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${match.name}, ${match.age}',
                          style: theme.textTheme.titleLarge?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  // 职业和城市
                  Row(
                    children: [
                      Icon(
                        Icons.work_outline,
                        size: 16,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        match.occupation,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Icon(
                        Icons.location_on_outlined,
                        size: 16,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          match.city,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  // AI 推荐理由
                  Expanded(
                    child: Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primaryContainer
                            .withValues(alpha: 0.3),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Icon(
                            Icons.auto_awesome,
                            size: 16,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: Text(
                              match.reason,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: theme.colorScheme.onSurface,
                              ),
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  // 操作按钮
                  if (interactive) ...[
                    const SizedBox(height: 12),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        // 跳过按钮
                        _ActionButton(
                          icon: Icons.close,
                          label: AppStrings.skip,
                          color: Colors.grey,
                          onTap: onSkip,
                        ),
                        // 感兴趣按钮
                        _ActionButton(
                          icon: Icons.favorite,
                          label: AppStrings.interested,
                          color: Colors.pinkAccent,
                          onTap: onInterested,
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPhoto() {
    if (match.photoUrl != null && match.photoUrl!.isNotEmpty) {
      return CachedNetworkImage(
        imageUrl: ApiConstants.fullImageUrl(match.photoUrl!),
        fit: BoxFit.cover,
        placeholder: (context, url) => Container(
          color: Colors.grey[200],
          child: const Center(child: CircularProgressIndicator()),
        ),
        errorWidget: (context, url, error) => _buildPlaceholderPhoto(),
      );
    }
    return _buildPlaceholderPhoto();
  }

  Widget _buildPlaceholderPhoto() {
    return Container(
      color: Colors.grey[200],
      child: const Center(
        child: Icon(Icons.person, size: 80, color: Colors.grey),
      ),
    );
  }

  Color _getScoreColor(int score) {
    if (score >= 90) return Colors.green;
    if (score >= 75) return Colors.teal;
    if (score >= 60) return Colors.orange;
    return Colors.grey;
  }
}

/// 操作按钮组件
class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(30),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
        decoration: BoxDecoration(
          border: Border.all(color: color.withValues(alpha: 0.5)),
          borderRadius: BorderRadius.circular(30),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 空状态页面
///
/// 无推荐时展示提示和跳转按钮。
/// 区分"今日暂无推荐"和"今日推荐已看完"两种状态。
class _EmptyStateView extends ConsumerWidget {
  const _EmptyStateView();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.explore_outlined,
              size: 80,
              color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.5),
            ),
            const SizedBox(height: 24),
            Text(
              AppStrings.allRecommendationViewed,
              style: theme.textTheme.titleMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              AppStrings.nextRecommendationHint,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.7),
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            FilledButton.tonal(
              onPressed: () {
                context.push(AppRoutes.preferencesEdit);
              },
              child: const Text('Adjust Preferences'),
            ),
          ],
        ),
      ),
    );
  }
}

/// 错误视图
class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;

  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline,
              size: 64,
              color: theme.colorScheme.error,
            ),
            const SizedBox(height: 16),
            Text(
              'Failed to load',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: onRetry,
              child: const Text(AppStrings.retry),
            ),
          ],
        ),
      ),
    );
  }
}

/// 匹配成功弹窗
///
/// 展示匹配成功图标/动画、对方姓名和"开始聊天"按钮。
class _MatchSuccessDialog extends StatelessWidget {
  final String partnerName;
  final VoidCallback onStartChat;

  const _MatchSuccessDialog({
    required this.partnerName,
    required this.onStartChat,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // 匹配成功动画图标
            Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(
                  colors: [
                    theme.colorScheme.primary,
                    theme.colorScheme.tertiary,
                  ],
                ),
              ),
              child: const Icon(
                Icons.favorite,
                color: Colors.white,
                size: 40,
              ),
            ),
            const SizedBox(height: 24),
            Text(
              AppStrings.matchSuccess,
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'You and $partnerName liked each other',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onStartChat,
                child: const Text(AppStrings.startChat),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('Maybe Later'),
            ),
          ],
        ),
      ),
    );
  }
}
