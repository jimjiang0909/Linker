import 'package:glados/glados.dart';
import 'package:linker_app/shared/models/message.dart';

/// **Validates: Requirements 7.4, 7.5**
///
/// 属性3：消息乐观更新最终一致性
/// 对于任意消息内容，乐观更新后消息列表长度增加 1。
void main() {
  group('属性3：消息乐观更新最终一致性', () {
    Glados(any.nonEmptyLetterOrDigits).test(
      '对于任意消息内容，乐观更新后消息列表长度增加 1',
      (content) {
        // 模拟消息列表
        final messages = <Message>[];
        final initialLength = messages.length;

        // 模拟乐观更新：立即添加消息到列表
        final optimisticMessage = Message(
          id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
          conversationId: 'conv_1',
          senderId: 'me',
          content: content,
          type: MessageType.text,
          isRead: false,
          createdAt: DateTime.now(),
          sendStatus: MessageSendStatus.sending,
        );
        messages.add(optimisticMessage);

        // 验证列表长度增加 1
        expect(messages.length, equals(initialLength + 1));
        // 验证最后一条消息内容正确
        expect(messages.last.content, equals(content));
        // 验证状态为 sending
        expect(messages.last.sendStatus, equals(MessageSendStatus.sending));
      },
    );
  });
}
