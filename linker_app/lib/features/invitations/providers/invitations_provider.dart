import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/invitation_code.dart';
import '../data/invitation_repository.dart';

/// 邀请码状态
///
/// 包含邀请码列表和已邀请用户列表的状态。
class InvitationsState {
  final AsyncValue<List<InvitationCode>> invitations;
  final AsyncValue<List<Invitee>> invitees;

  const InvitationsState({
    this.invitations = const AsyncData([]),
    this.invitees = const AsyncData([]),
  });

  InvitationsState copyWith({
    AsyncValue<List<InvitationCode>>? invitations,
    AsyncValue<List<Invitee>>? invitees,
  }) {
    return InvitationsState(
      invitations: invitations ?? this.invitations,
      invitees: invitees ?? this.invitees,
    );
  }
}

/// 邀请码状态管理 Notifier
///
/// 管理邀请码列表和已邀请用户列表的获取与状态更新。
class InvitationsNotifier extends Notifier<InvitationsState> {
  @override
  InvitationsState build() => const InvitationsState();

  /// 获取邀请码列表
  ///
  /// 调用 [InvitationRepository.getInvitations]，
  /// 成功后更新 invitations 状态，失败时设置为 AsyncError。
  Future<void> fetchInvitations() async {
    state = state.copyWith(
      invitations: const AsyncLoading(),
    );
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(invitationRepositoryProvider);
      return repository.getInvitations();
    });
    state = state.copyWith(invitations: result);
  }

  /// 获取已邀请用户列表
  ///
  /// 调用 [InvitationRepository.getInvitees]，
  /// 成功后更新 invitees 状态，失败时设置为 AsyncError。
  Future<void> fetchInvitees() async {
    state = state.copyWith(
      invitees: const AsyncLoading(),
    );
    final result = await AsyncValue.guard(() async {
      final repository = ref.read(invitationRepositoryProvider);
      return repository.getInvitees();
    });
    state = state.copyWith(invitees: result);
  }
}

/// InvitationsNotifier 的 Riverpod Provider
final invitationsProvider =
    NotifierProvider<InvitationsNotifier, InvitationsState>(
        InvitationsNotifier.new);
