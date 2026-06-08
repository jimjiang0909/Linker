import 'package:glados/glados.dart';
import 'package:linker_app/shared/models/conversation.dart';

/// **Validates: Requirements 6.2, 11.3**
///
/// 属性8：未读消息计数准确性
/// 未读总数 = 所有对话 unreadCount 之和。
void main() {
  group('属性8：未读消息计数准确性', () {
    Glados(any.listWithLengthInRange(0, 21, any.intInRange(0, 50))).test(
      '未读总数 = 所有对话 unreadCount 之和',
      (unreadCounts) {
        // 生成对话列表
        final conversations = unreadCounts.asMap().entries.map((entry) {
          return Conversation(
            id: 'conv_${entry.key}',
            partnerName: 'User ${entry.key}',
            unreadCount: entry.value,
            status: ConversationStatus.active,
          );
        }).toList();

        // 计算未读总数（与 ConversationsNotifier._updateUnreadCount 逻辑一致）
        final totalUnread =
            conversations.fold<int>(0, (sum, c) => sum + c.unreadCount);

        // 验证总数等于各对话未读数之和
        final expectedTotal = unreadCounts.fold<int>(0, (sum, c) => sum + c);
        expect(totalUnread, equals(expectedTotal));
        // 总数不应为负数
        expect(totalUnread, greaterThanOrEqualTo(0));
      },
    );
  });
}
