import 'dart:convert';

/// 消息类型枚举
enum MessageType {
  text,
  system,
  introduction,
  icebreaker,
}

/// 消息发送状态枚举
enum MessageSendStatus {
  sending,
  sent,
  failed,
}

/// 消息模型
class Message {
  final String id;
  final String conversationId;
  final String senderId;
  final String content;
  final MessageType type;
  final bool isRead;
  final DateTime createdAt;
  final MessageSendStatus sendStatus;

  const Message({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.content,
    required this.type,
    required this.isRead,
    required this.createdAt,
    required this.sendStatus,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final typeStr = json['type'] as String? ?? 'text';
    var type = MessageType.values
        .where((e) => e.name == typeStr)
        .firstOrNull ?? MessageType.text;
    var content = json['content'] as String;

    // Parse system message JSON content into introduction type
    if (type == MessageType.system && content.startsWith('{')) {
      try {
        final parsed = _parseJsonContent(content);
        if (parsed != null) {
          type = MessageType.introduction;
          content = parsed;
        }
      } catch (_) {
        // Fallback: show as generic system message
        content = 'You have been matched! Start chatting now.';
      }
    }

    return Message(
      id: json['id'] as String,
      conversationId:
          (json['conversationId'] ?? json['conversation_id']) as String,
      senderId: (json['senderId'] ?? json['sender_id']) as String,
      content: content,
      type: type,
      isRead: (json['isRead'] ?? json['is_read'] ?? false) as bool,
      createdAt: DateTime.parse(
          (json['createdAt'] ?? json['created_at']) as String),
      sendStatus: json.containsKey('sendStatus')
          ? MessageSendStatus.values.byName(json['sendStatus'] as String)
          : MessageSendStatus.sent,
    );
  }

  /// Parse JSON system message, extract introduction text
  static String? _parseJsonContent(String content) {
    final map = Map<String, dynamic>.from(
      const JsonDecoder().convert(content) as Map,
    );
    final intro = map['introduction'] as String?;
    if (intro != null && intro.isNotEmpty) return intro;
    return null;
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'conversationId': conversationId,
      'senderId': senderId,
      'content': content,
      'type': type.name,
      'isRead': isRead,
      'createdAt': createdAt.toIso8601String(),
      'sendStatus': sendStatus.name,
    };
  }

  Message copyWith({
    String? id,
    String? conversationId,
    String? senderId,
    String? content,
    MessageType? type,
    bool? isRead,
    DateTime? createdAt,
    MessageSendStatus? sendStatus,
  }) {
    return Message(
      id: id ?? this.id,
      conversationId: conversationId ?? this.conversationId,
      senderId: senderId ?? this.senderId,
      content: content ?? this.content,
      type: type ?? this.type,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt ?? this.createdAt,
      sendStatus: sendStatus ?? this.sendStatus,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Message &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          conversationId == other.conversationId &&
          senderId == other.senderId &&
          content == other.content &&
          type == other.type &&
          isRead == other.isRead &&
          createdAt == other.createdAt &&
          sendStatus == other.sendStatus;

  @override
  int get hashCode => Object.hash(
        id,
        conversationId,
        senderId,
        content,
        type,
        isRead,
        createdAt,
        sendStatus,
      );

  @override
  String toString() =>
      'Message(id: $id, conversationId: $conversationId, '
      'senderId: $senderId, type: $type, sendStatus: $sendStatus, '
      'createdAt: $createdAt)';
}
