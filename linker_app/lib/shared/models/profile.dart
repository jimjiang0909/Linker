/// 性别枚举
enum Gender {
  male,
  female,
  other,
}

/// 照片模型
class Photo {
  final String id;
  final String url;
  final int order;

  const Photo({
    required this.id,
    required this.url,
    required this.order,
  });

  factory Photo.fromJson(Map<String, dynamic> json) {
    return Photo(
      id: json['id'] as String,
      url: json['url'] as String,
      order: (json['sortOrder'] ?? json['order']) as int,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'url': url,
      'order': order,
    };
  }

  Photo copyWith({
    String? id,
    String? url,
    int? order,
  }) {
    return Photo(
      id: id ?? this.id,
      url: url ?? this.url,
      order: order ?? this.order,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Photo &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          url == other.url &&
          order == other.order;

  @override
  int get hashCode => Object.hash(id, url, order);

  @override
  String toString() => 'Photo(id: $id, url: $url, order: $order)';
}

/// 用户资料模型
class Profile {
  final String id;
  final String name;
  final int birthYear;
  final Gender gender;
  final String occupation;
  final String city;
  final String? bio;
  final List<Photo> photos;
  final DateTime createdAt;

  const Profile({
    required this.id,
    required this.name,
    required this.birthYear,
    required this.gender,
    required this.occupation,
    required this.city,
    this.bio,
    required this.photos,
    required this.createdAt,
  });

  factory Profile.fromJson(Map<String, dynamic> json) {
    return Profile(
      id: json['id'] as String,
      name: json['name'] as String,
      birthYear: json['birthYear'] as int,
      gender: Gender.values.byName(json['gender'] as String),
      occupation: json['occupation'] as String,
      city: json['city'] as String,
      bio: json['bio'] as String?,
      photos: (json['photos'] as List<dynamic>?)
              ?.map((e) => Photo.fromJson(e as Map<String, dynamic>))
              .toList() ??
          [],
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'birthYear': birthYear,
      'gender': gender.name,
      'occupation': occupation,
      'city': city,
      'bio': bio,
      'photos': photos.map((e) => e.toJson()).toList(),
      'createdAt': createdAt.toIso8601String(),
    };
  }

  Profile copyWith({
    String? id,
    String? name,
    int? birthYear,
    Gender? gender,
    String? occupation,
    String? city,
    String? bio,
    List<Photo>? photos,
    DateTime? createdAt,
  }) {
    return Profile(
      id: id ?? this.id,
      name: name ?? this.name,
      birthYear: birthYear ?? this.birthYear,
      gender: gender ?? this.gender,
      occupation: occupation ?? this.occupation,
      city: city ?? this.city,
      bio: bio ?? this.bio,
      photos: photos ?? this.photos,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Profile &&
          runtimeType == other.runtimeType &&
          id == other.id &&
          name == other.name &&
          birthYear == other.birthYear &&
          gender == other.gender &&
          occupation == other.occupation &&
          city == other.city &&
          bio == other.bio &&
          photos == other.photos &&
          createdAt == other.createdAt;

  @override
  int get hashCode => Object.hash(
        id,
        name,
        birthYear,
        gender,
        occupation,
        city,
        bio,
        Object.hashAll(photos),
        createdAt,
      );

  @override
  String toString() =>
      'Profile(id: $id, name: $name, birthYear: $birthYear, gender: $gender, '
      'occupation: $occupation, city: $city, bio: $bio, '
      'photos: $photos, createdAt: $createdAt)';
}
