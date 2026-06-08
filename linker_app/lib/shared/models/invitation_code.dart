/// 邀请码状态枚举
enum InvitationStatus {
  available,
  used,
  expired,
}

/// 被邀请人模型
class Invitee {
  final String id;
  final String name;
  final DateTime registeredAt;

  const Invitee({
    required this.id,
    required this.name,
    required this.registeredAt,
  });

  factory Invitee.fromJson(Map<String, dynamic> json) {
    final String name;
    if (json.containsKey('name')) {
      name = json['name'] as String? ?? 'Anonymous';
    } else if (json['profile'] != null) {
      name = (json['profile'] as Map<String, dynamic>)['name'] as String? ??
          'Anonymous';
    } else {
      name = 'Anonymous';
    }
    return Invitee(
      id: json['id'] as String,
      name: name,
      registeredAt: DateTime.parse(
          (json['registeredAt'] ?? json['registered_at'] ?? json['createdAt'] ?? json['created_at']) as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'registeredAt': registeredAt.toIso8601String(),
    };
  }

  Invitee copyWith({
    String? id,
    String? name,
    DateTime? registeredAt,
  }) {
    return Invitee(
      id: id ?? this.id,
      name: name ?? this.name,
      registeredAt: registeredAt ?? this.registeredAt,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Invitee &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          name == other.name &&
          registeredAt == other.registeredAt;

  @override
  int get hashCode => Object.hash(id, name, registeredAt);

  @override
  String toString() =>
      'Invitee(id: $id, name: $name, registeredAt: $registeredAt)';
}

/// 邀请码模型
class InvitationCode {
  final String id;
  final String code;
  final InvitationStatus status;
  final DateTime expiresAt;
  final int remainingDays;

  const InvitationCode({
    required this.id,
    required this.code,
    required this.status,
    required this.expiresAt,
    required this.remainingDays,
  });

  factory InvitationCode.fromJson(Map<String, dynamic> json) {
    final expiresAt = DateTime.parse(
        (json['expiresAt'] ?? json['expires_at']) as String);
    final remainingDays = json['remainingDays'] as int? ??
        json['remaining_days'] as int? ??
        expiresAt.difference(DateTime.now()).inDays;
    return InvitationCode(
      id: json['id'] as String,
      code: json['code'] as String,
      status: InvitationStatus.values.byName(json['status'] as String),
      expiresAt: expiresAt,
      remainingDays: remainingDays,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'code': code,
      'status': status.name,
      'expiresAt': expiresAt.toIso8601String(),
      'remainingDays': remainingDays,
    };
  }

  InvitationCode copyWith({
    String? id,
    String? code,
    InvitationStatus? status,
    DateTime? expiresAt,
    int? remainingDays,
  }) {
    return InvitationCode(
      id: id ?? this.id,
      code: code ?? this.code,
      status: status ?? this.status,
      expiresAt: expiresAt ?? this.expiresAt,
      remainingDays: remainingDays ?? this.remainingDays,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is InvitationCode &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          code == other.code &&
          status == other.status &&
          expiresAt == other.expiresAt &&
          remainingDays == other.remainingDays;

  @override
  int get hashCode => Object.hash(id, code, status, expiresAt, remainingDays);

  @override
  String toString() =>
      'InvitationCode(id: $id, code: $code, status: $status, '
      'expiresAt: $expiresAt, remainingDays: $remainingDays)';
}
