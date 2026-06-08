/// 匹配状态枚举
enum MatchStatus {
  pending,
  interested,
  skipped,
  matched,
}

/// 每日推荐匹配模型
class DailyMatch {
  final String id;
  final String name;
  final int age;
  final String occupation;
  final String city;
  final int score;
  final String reason;
  final String? photoUrl;
  final MatchStatus status;

  const DailyMatch({
    required this.id,
    required this.name,
    required this.age,
    required this.occupation,
    required this.city,
    required this.score,
    required this.reason,
    this.photoUrl,
    required this.status,
  });

  factory DailyMatch.fromJson(Map<String, dynamic> json) {
    return DailyMatch(
      id: json['id'] as String,
      name: json['name'] as String,
      age: json['age'] as int,
      occupation: json['occupation'] as String,
      city: json['city'] as String,
      score: json['score'] as int,
      reason: (json['reason'] ?? '') as String,
      photoUrl: json['photoUrl'] as String?,
      status: MatchStatus.values.byName(json['status'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'age': age,
      'occupation': occupation,
      'city': city,
      'score': score,
      'reason': reason,
      'photoUrl': photoUrl,
      'status': status.name,
    };
  }

  DailyMatch copyWith({
    String? id,
    String? name,
    int? age,
    String? occupation,
    String? city,
    int? score,
    String? reason,
    String? photoUrl,
    MatchStatus? status,
  }) {
    return DailyMatch(
      id: id ?? this.id,
      name: name ?? this.name,
      age: age ?? this.age,
      occupation: occupation ?? this.occupation,
      city: city ?? this.city,
      score: score ?? this.score,
      reason: reason ?? this.reason,
      photoUrl: photoUrl ?? this.photoUrl,
      status: status ?? this.status,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is DailyMatch &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          name == other.name &&
          age == other.age &&
          occupation == other.occupation &&
          city == other.city &&
          score == other.score &&
          reason == other.reason &&
          photoUrl == other.photoUrl &&
          status == other.status;

  @override
  int get hashCode => Object.hash(
        id,
        name,
        age,
        occupation,
        city,
        score,
        reason,
        photoUrl,
        status,
      );

  @override
  String toString() =>
      'DailyMatch(id: $id, name: $name, age: $age, occupation: $occupation, '
      'city: $city, score: $score, reason: $reason, photoUrl: $photoUrl, '
      'status: $status)';
}
