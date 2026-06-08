import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/utils/error_utils.dart';
import '../../../shared/models/invitation_code.dart';
import '../providers/invitations_provider.dart';

/// 已邀请用户列表页面
///
/// 展示当前用户已邀请的所有用户，每项显示：
/// - 昵称
/// - 注册时间
class InviteesPage extends ConsumerStatefulWidget {
  const InviteesPage({super.key});

  @override
  ConsumerState<InviteesPage> createState() => _InviteesPageState();
}

class _InviteesPageState extends ConsumerState<InviteesPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      ref.read(invitationsProvider.notifier).fetchInvitees();
    });
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(invitationsProvider);
    final inviteesState = state.invitees;

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.invitedUsers),
        centerTitle: true,
      ),
      body: inviteesState.when(
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
                  ref.read(invitationsProvider.notifier).fetchInvitees();
                },
                child: const Text(AppStrings.retry),
              ),
            ],
          ),
        ),
        data: (invitees) {
          if (invitees.isEmpty) {
            return const Center(
              child: Text('No invited friends yet'),
            );
          }
          return ListView.separated(
            padding: const EdgeInsets.all(AppSizes.spacingMd),
            itemCount: invitees.length,
            separatorBuilder: (_, _) => const Divider(height: 1),
            itemBuilder: (context, index) {
              return _InviteeListItem(invitee: invitees[index]);
            },
          );
        },
      ),
    );
  }
}

/// 已邀请用户列表项组件
class _InviteeListItem extends StatelessWidget {
  const _InviteeListItem({required this.invitee});

  final Invitee invitee;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: CircleAvatar(
        radius: AppSizes.avatarSm / 2,
        child: Text(
          invitee.name.isNotEmpty ? invitee.name[0].toUpperCase() : '?',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
      ),
      title: Text(
        invitee.name,
        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w500,
            ),
      ),
      subtitle: Text(
        'Joined: ${_formatDate(invitee.registeredAt)}',
        style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context)
                  .colorScheme
                  .onSurface
                  .withValues(alpha: 0.6),
            ),
      ),
    );
  }

  /// 格式化日期为 yyyy-MM-dd
  String _formatDate(DateTime date) {
    final local = date.toLocal();
    return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
  }
}
