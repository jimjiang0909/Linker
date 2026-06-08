import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/utils/error_utils.dart';
import '../../../shared/models/invitation_code.dart';
import '../providers/invitations_provider.dart';

/// 邀请码列表页面
///
/// 展示当前用户的所有邀请码，每个邀请码显示：
/// - 码值
/// - 状态（可用/已使用/已过期）
/// - 剩余有效天数
/// - 可用状态的邀请码提供"复制"按钮
class InvitationsPage extends ConsumerStatefulWidget {
  const InvitationsPage({super.key});

  @override
  ConsumerState<InvitationsPage> createState() => _InvitationsPageState();
}

class _InvitationsPageState extends ConsumerState<InvitationsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(invitationsProvider.notifier).fetchInvitations();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(invitationsProvider);
    final invitationsState = state.invitations;

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.myInvitationCodes),
        centerTitle: true,
      ),
      body: invitationsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                getErrorMessage(error),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: AppSizes.spacingMd),
              ElevatedButton(
                onPressed: () {
                  ref.read(invitationsProvider.notifier).fetchInvitations();
                },
                child: const Text(AppStrings.retry),
              ),
            ],
          ),
        ),
        data: (invitations) {
          if (invitations.isEmpty) {
            return const Center(
              child: Text('No invite codes yet'),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSizes.spacingMd),
            itemCount: invitations.length,
            separatorBuilder: (_, _) =>
                const SizedBox(height: AppSizes.spacingSm),
            itemBuilder: (context, index) {
              return _InvitationCodeCard(
                invitation: invitations[index],
              );
            },
          );
        },
      ),
    );
  }
}

/// 邀请码卡片组件
class _InvitationCodeCard extends StatelessWidget {
  const _InvitationCodeCard({required this.invitation});

  final InvitationCode invitation;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingMd),
        child: Row(
          children: [
            // 左侧：邀请码信息
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 邀请码值
                  Text(
                    invitation.code,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w600,
                          letterSpacing: 1.5,
                        ),
                  ),
                  const SizedBox(height: AppSizes.spacingSm),
                  // 状态和剩余天数
                  Row(
                    children: [
                      _buildStatusChip(context),
                      const SizedBox(width: AppSizes.spacingSm),
                      if (invitation.status == InvitationStatus.available)
                        Text(
                          '${invitation.remainingDays} days left',
                          style:
                              Theme.of(context).textTheme.bodySmall?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface
                                        .withValues(alpha: 0.6),
                                  ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            // 右侧：复制按钮（仅可用状态显示）
            if (invitation.status == InvitationStatus.available)
              IconButton(
                onPressed: () => _copyToClipboard(context),
                icon: const Icon(Icons.copy),
                tooltip: 'Copy invite code',
              ),
          ],
        ),
      ),
    );
  }

  /// 构建状态标签
  Widget _buildStatusChip(BuildContext context) {
    final (label, color) = switch (invitation.status) {
      InvitationStatus.available => (
          AppStrings.invitationAvailable,
          Colors.green
        ),
      InvitationStatus.used => (AppStrings.invitationUsed, Colors.grey),
      InvitationStatus.expired => (
          AppStrings.invitationExpired,
          Colors.orange
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSizes.spacingSm,
        vertical: AppSizes.spacingXs,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(AppSizes.radiusSm),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: color,
              fontWeight: FontWeight.w600,
            ),
      ),
    );
  }

  /// 复制邀请码到剪贴板
  void _copyToClipboard(BuildContext context) {
    Clipboard.setData(ClipboardData(text: invitation.code));
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(AppStrings.copySuccess),
        duration: Duration(seconds: 2),
      ),
    );
  }
}
