/// 对话状态枚举
enum ConversationStatus {
  active,
  ended,
}

/// 对话模型
class Conversation {
  final String id;
  final String partnerName;
  final String? partnerPhotoUrl;
  final String? lastMessage;
  final DateTime? lastMessageAt;
  final int unreadCount;
  final ConversationStatus status;
  final String? introduction;
  final List<String> icebreakers;

  const Conversation({
    required this.id,
    required this.partnerName,
    this.partnerPhotoUrl,
    this.lastMessage,
    this.lastMessageAt,
    required this.unreadCount,
    required this.status,
    this.introduction,
    this.icebreakers = const [],
  });

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] as String,
      partnerName: json['partnerName'] as String,
      partnerPhotoUrl: json['partnerPhotoUrl'] as String?,
      lastMessage: json['lastMessage'] as String?,
      lastMessageAt: json['lastMessageAt'] != null
          ? DateTime.parse(json['lastMessageAt'] as String)
          : null,
      unreadCount: json['unreadCount'] as int,
      status: ConversationStatus.values
          .where((e) => e.name == (json['status'] as String?))
          .firstOrNull ?? ConversationStatus.active,
      introduction: json['introduction'] as String?,
      icebreakers: (json['icebreakers'] as List<dynamic>?)
              ?.map((e) => e as String)
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'partnerName': partnerName,
      'partnerPhotoUrl': partnerPhotoUrl,
      'lastMessage': lastMessage,
      'lastMessageAt': lastMessageAt?.toIso8601String(),
      'unreadCount': unreadCount,
      'status': status.name,
      'introduction': introduction,
      'icebreakers': icebreakers,
    };
  }

  Conversation copyWith({
    String? id,
    String? partnerName,
    String? partnerPhotoUrl,
    String? lastMessage,
    DateTime? lastMessageAt,
    int? unreadCount,
    ConversationStatus? status,
    String? introduction,
    List<String>? icebreakers,
  }) {
    return Conversation(
      id: id ?? this.id,
      partnerName: partnerName ?? this.partnerName,
      partnerPhotoUrl: partnerPhotoUrl ?? this.partnerPhotoUrl,
      lastMessage: lastMessage ?? this.lastMessage,
      lastMessageAt: lastMessageAt ?? this.lastMessageAt,
      unreadCount: unreadCount ?? this.unreadCount,
      status: status ?? this.status,
      introduction: introduction ?? this.introduction,
      icebreakers: icebreakers ?? this.icebreakers,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Conversation &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          partnerName == other.partnerName &&
          partnerPhotoUrl == other.partnerPhotoUrl &&
          lastMessage == other.lastMessage &&
          lastMessageAt == other.lastMessageAt &&
          unreadCount == other.unreadCount &&
          status == other.status &&
          introduction == other.introduction &&
          icebreakers == other.icebreakers;

  @override
  int get hashCode => Object.hash(
        id,
        partnerName,
        partnerPhotoUrl,
        lastMessage,
        lastMessageAt,
        unreadCount,
        status,
        introduction,
        Object.hashAll(icebreakers),
      );

  @override
  String toString() =>
      'Conversation(id: $id, partnerName: $partnerName, '
      'lastMessage: $lastMessage, lastMessageAt: $lastMessageAt, '
      'unreadCount: $unreadCount, status: $status)';
}
