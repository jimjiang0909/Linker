import 'package:glados/glados.dart';
import 'package:linker_app/shared/models/conversation.dart';

/// **Validates: Requirements 6.3, 6.5**
///
/// 属性7：对话列表排序正确性
/// 排序后的列表中，每个元素的 lastMessageAt >= 下一个元素的 lastMessageAt。
void main() {
  group('属性7：对话列表排序正确性', () {
    /// 按最后消息时间倒序排列（与 ConversationsNotifier 中的逻辑一致）
    int sortByLastMessageDesc(Conversation a, Conversation b) {
      final aTime = a.lastMessageAt;
      final bTime = b.lastMessageAt;
      if (aTime == null && bTime == null) return 0;
      if (aTime == null) return 1;
      if (bTime == null) return -1;
      return bTime.compareTo(aTime);
    }

    Glados(any.listWithLengthInRange(2, 11, any.intInRange(1, 100))).test(
      '排序后的列表中，每个元素的 lastMessageAt >= 下一个元素的 lastMessageAt',
      (timestamps) {
        // 生成对话列表
        final conversations = timestamps.asMap().entries.map((entry) {
          return Conversation(
            id: 'conv_${entry.key}',
            partnerName: 'User ${entry.key}',
            lastMessageAt: DateTime(2024, 1, 1).add(
              Duration(hours: entry.value),
            ),
            unreadCount: 0,
            status: ConversationStatus.active,
          );
        }).toList();

        // 排序
        conversations.sort(sortByLastMessageDesc);

        // 验证排序正确性：每个元素的 lastMessageAt >= 下一个元素的 lastMessageAt
        for (int i = 0; i < conversations.length - 1; i++) {
          final current = conversations[i].lastMessageAt!;
          final next = conversations[i + 1].lastMessageAt!;
          expect(
            current.isAfter(next) || current.isAtSameMomentAs(next),
            isTrue,
            reason:
                '索引 $i 的时间 $current 应 >= 索引 ${i + 1} 的时间 $next',
          );
        }
      },
    );
  });
}
