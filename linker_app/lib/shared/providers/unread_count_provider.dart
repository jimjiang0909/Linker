import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 未读消息总数 Notifier
///
/// 管理所有对话的未读消息数之和。
/// 当前暂时返回 0，后续对话模块实现后会更新为从对话列表中计算实际未读数。
class UnreadCountNotifier extends Notifier<int> {
  @override
  int build() => 0;

  /// 更新未读消息总数
  void setCount(int count) {
    state = count;
  }

  /// 增加未读消息数
  void increment([int amount = 1]) {
    state += amount;
  }

  /// 减少未读消息数
  void decrement(int amount) {
    state = (state - amount).clamp(0, state);
  }

  /// 清零
  void reset() {
    state = 0;
  }
}

/// 未读消息总数 Provider
final unreadCountProvider =
    NotifierProvider<UnreadCountNotifier, int>(UnreadCountNotifier.new);
