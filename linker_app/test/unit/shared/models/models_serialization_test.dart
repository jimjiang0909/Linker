import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/shared/models/profile.dart';
import 'package:linker_app/shared/models/daily_match.dart';
import 'package:linker_app/shared/models/conversation.dart';
import 'package:linker_app/shared/models/message.dart';
import 'package:linker_app/shared/models/invitation_code.dart';

void main() {
  group('Photo serialization', () {
    test('fromJson creates correct Photo', () {
      final json = {'id': 'p1', 'url': 'https://example.com/photo.jpg', 'order': 0};
      final photo = Photo.fromJson(json);

      expect(photo.id, 'p1');
      expect(photo.url, 'https://example.com/photo.jpg');
      expect(photo.order, 0);
    });

    test('toJson produces correct map', () {
      const photo = Photo(id: 'p1', url: 'https://example.com/photo.jpg', order: 0);
      final json = photo.toJson();

      expect(json['id'], 'p1');
      expect(json['url'], 'https://example.com/photo.jpg');
      expect(json['order'], 0);
    });

    test('roundtrip preserves data', () {
      const original = Photo(id: 'p1', url: 'https://example.com/photo.jpg', order: 2);
      final restored = Photo.fromJson(original.toJson());
      expect(restored, original);
    });
  });

  group('Profile serialization', () {
    test('fromJson creates correct Profile', () {
      final json = {
        'id': 'u1',
        'name': 'Alice',
        'birthYear': 1995,
        'gender': 'female',
        'occupation': 'Engineer',
        'city': 'Beijing',
        'bio': 'Hello world',
        'photos': [
          {'id': 'p1', 'url': 'https://example.com/1.jpg', 'order': 0},
        ],
        'createdAt': '2024-01-15T10:30:00.000Z',
      };
      final profile = Profile.fromJson(json);

      expect(profile.id, 'u1');
      expect(profile.name, 'Alice');
      expect(profile.birthYear, 1995);
      expect(profile.gender, Gender.female);
      expect(profile.occupation, 'Engineer');
      expect(profile.city, 'Beijing');
      expect(profile.bio, 'Hello world');
      expect(profile.photos.length, 1);
      expect(profile.photos[0].id, 'p1');
      expect(profile.createdAt, DateTime.parse('2024-01-15T10:30:00.000Z'));
    });

    test('fromJson handles null bio and empty photos', () {
      final json = {
        'id': 'u2',
        'name': 'Bob',
        'birthYear': 1990,
        'gender': 'male',
        'occupation': 'Designer',
        'city': 'Shanghai',
        'bio': null,
        'photos': null,
        'createdAt': '2024-02-01T08:00:00.000Z',
      };
      final profile = Profile.fromJson(json);

      expect(profile.bio, isNull);
      expect(profile.photos, isEmpty);
    });

    test('toJson produces correct map', () {
      final profile = Profile(
        id: 'u1',
        name: 'Alice',
        birthYear: 1995,
        gender: Gender.female,
        occupation: 'Engineer',
        city: 'Beijing',
        bio: null,
        photos: const [Photo(id: 'p1', url: 'https://example.com/1.jpg', order: 0)],
        createdAt: DateTime.utc(2024, 1, 15, 10, 30),
      );
      final json = profile.toJson();

      expect(json['id'], 'u1');
      expect(json['gender'], 'female');
      expect(json['bio'], isNull);
      expect(json['photos'], isList);
      expect((json['photos'] as List).length, 1);
      expect(json['createdAt'], '2024-01-15T10:30:00.000Z');
    });

    test('roundtrip preserves data', () {
      final original = Profile(
        id: 'u1',
        name: 'Alice',
        birthYear: 1995,
        gender: Gender.other,
        occupation: 'Engineer',
        city: 'Beijing',
        bio: 'Bio text',
        photos: const [Photo(id: 'p1', url: 'https://example.com/1.jpg', order: 0)],
        createdAt: DateTime.utc(2024, 1, 15, 10, 30),
      );
      final json = original.toJson();
      final restored = Profile.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.name, original.name);
      expect(restored.birthYear, original.birthYear);
      expect(restored.gender, original.gender);
      expect(restored.occupation, original.occupation);
      expect(restored.city, original.city);
      expect(restored.bio, original.bio);
      expect(restored.photos.length, original.photos.length);
      expect(restored.photos[0], original.photos[0]);
      expect(restored.createdAt, original.createdAt);
    });
  });

  group('DailyMatch serialization', () {
    test('fromJson creates correct DailyMatch', () {
      final json = {
        'id': 'm1',
        'name': 'Charlie',
        'age': 28,
        'occupation': 'Teacher',
        'city': 'Guangzhou',
        'score': 85,
        'reason': 'Similar interests',
        'photoUrl': 'https://example.com/photo.jpg',
        'status': 'pending',
      };
      final match = DailyMatch.fromJson(json);

      expect(match.id, 'm1');
      expect(match.name, 'Charlie');
      expect(match.age, 28);
      expect(match.score, 85);
      expect(match.photoUrl, 'https://example.com/photo.jpg');
      expect(match.status, MatchStatus.pending);
    });

    test('fromJson handles null photoUrl', () {
      final json = {
        'id': 'm2',
        'name': 'Diana',
        'age': 25,
        'occupation': 'Doctor',
        'city': 'Shenzhen',
        'score': 90,
        'reason': 'Great match',
        'photoUrl': null,
        'status': 'interested',
      };
      final match = DailyMatch.fromJson(json);
      expect(match.photoUrl, isNull);
      expect(match.status, MatchStatus.interested);
    });

    test('roundtrip preserves data', () {
      const original = DailyMatch(
        id: 'm1',
        name: 'Charlie',
        age: 28,
        occupation: 'Teacher',
        city: 'Guangzhou',
        score: 85,
        reason: 'Similar interests',
        photoUrl: 'https://example.com/photo.jpg',
        status: MatchStatus.matched,
      );
      final restored = DailyMatch.fromJson(original.toJson());
      expect(restored, original);
    });
  });

  group('Conversation serialization', () {
    test('fromJson creates correct Conversation', () {
      final json = {
        'id': 'c1',
        'partnerName': 'Eve',
        'partnerPhotoUrl': 'https://example.com/eve.jpg',
        'lastMessage': 'Hello!',
        'lastMessageAt': '2024-03-01T14:00:00.000Z',
        'unreadCount': 3,
        'status': 'active',
        'introduction': 'Nice to meet you',
        'icebreakers': ['What do you do?', 'Favorite movie?'],
      };
      final conversation = Conversation.fromJson(json);

      expect(conversation.id, 'c1');
      expect(conversation.partnerName, 'Eve');
      expect(conversation.partnerPhotoUrl, 'https://example.com/eve.jpg');
      expect(conversation.lastMessage, 'Hello!');
      expect(conversation.lastMessageAt, DateTime.parse('2024-03-01T14:00:00.000Z'));
      expect(conversation.unreadCount, 3);
      expect(conversation.status, ConversationStatus.active);
      expect(conversation.introduction, 'Nice to meet you');
      expect(conversation.icebreakers, ['What do you do?', 'Favorite movie?']);
    });

    test('fromJson handles null optional fields', () {
      final json = {
        'id': 'c2',
        'partnerName': 'Frank',
        'partnerPhotoUrl': null,
        'lastMessage': null,
        'lastMessageAt': null,
        'unreadCount': 0,
        'status': 'ended',
        'introduction': null,
        'icebreakers': null,
      };
      final conversation = Conversation.fromJson(json);

      expect(conversation.partnerPhotoUrl, isNull);
      expect(conversation.lastMessage, isNull);
      expect(conversation.lastMessageAt, isNull);
      expect(conversation.introduction, isNull);
      expect(conversation.icebreakers, isEmpty);
      expect(conversation.status, ConversationStatus.ended);
    });

    test('roundtrip preserves data', () {
      final original = Conversation(
        id: 'c1',
        partnerName: 'Eve',
        partnerPhotoUrl: 'https://example.com/eve.jpg',
        lastMessage: 'Hello!',
        lastMessageAt: DateTime.utc(2024, 3, 1, 14),
        unreadCount: 3,
        status: ConversationStatus.active,
        introduction: 'Nice to meet you',
        icebreakers: const ['What do you do?'],
      );
      final json = original.toJson();
      final restored = Conversation.fromJson(json);

      expect(restored.id, original.id);
      expect(restored.partnerName, original.partnerName);
      expect(restored.partnerPhotoUrl, original.partnerPhotoUrl);
      expect(restored.lastMessage, original.lastMessage);
      expect(restored.lastMessageAt, original.lastMessageAt);
      expect(restored.unreadCount, original.unreadCount);
      expect(restored.status, original.status);
      expect(restored.introduction, original.introduction);
      expect(restored.icebreakers, original.icebreakers);
    });
  });

  group('Message serialization', () {
    test('fromJson creates correct Message', () {
      final json = {
        'id': 'msg1',
        'conversationId': 'c1',
        'senderId': 'u1',
        'content': 'Hi there!',
        'type': 'text',
        'isRead': true,
        'createdAt': '2024-03-01T14:05:00.000Z',
        'sendStatus': 'sent',
      };
      final message = Message.fromJson(json);

      expect(message.id, 'msg1');
      expect(message.conversationId, 'c1');
      expect(message.senderId, 'u1');
      expect(message.content, 'Hi there!');
      expect(message.type, MessageType.text);
      expect(message.isRead, true);
      expect(message.createdAt, DateTime.parse('2024-03-01T14:05:00.000Z'));
      expect(message.sendStatus, MessageSendStatus.sent);
    });

    test('fromJson handles all message types', () {
      for (final type in MessageType.values) {
        final json = {
          'id': 'msg1',
          'conversationId': 'c1',
          'senderId': 'u1',
          'content': 'content',
          'type': type.name,
          'isRead': false,
          'createdAt': '2024-03-01T14:05:00.000Z',
          'sendStatus': 'sending',
        };
        final message = Message.fromJson(json);
        expect(message.type, type);
      }
    });

    test('roundtrip preserves data', () {
      final original = Message(
        id: 'msg1',
        conversationId: 'c1',
        senderId: 'u1',
        content: 'Hi there!',
        type: MessageType.icebreaker,
        isRead: false,
        createdAt: DateTime.utc(2024, 3, 1, 14, 5),
        sendStatus: MessageSendStatus.failed,
      );
      final restored = Message.fromJson(original.toJson());
      expect(restored, original);
    });
  });

  group('Invitee serialization', () {
    test('fromJson creates correct Invitee', () {
      final json = {
        'id': 'inv1',
        'name': 'Grace',
        'registeredAt': '2024-02-20T09:00:00.000Z',
      };
      final invitee = Invitee.fromJson(json);

      expect(invitee.id, 'inv1');
      expect(invitee.name, 'Grace');
      expect(invitee.registeredAt, DateTime.parse('2024-02-20T09:00:00.000Z'));
    });

    test('roundtrip preserves data', () {
      final original = Invitee(
        id: 'inv1',
        name: 'Grace',
        registeredAt: DateTime.utc(2024, 2, 20, 9),
      );
      final restored = Invitee.fromJson(original.toJson());
      expect(restored, original);
    });
  });

  group('InvitationCode serialization', () {
    test('fromJson creates correct InvitationCode', () {
      final json = {
        'id': 'ic1',
        'code': 'ABC12345',
        'status': 'available',
        'expiresAt': '2024-06-01T00:00:00.000Z',
        'remainingDays': 30,
      };
      final code = InvitationCode.fromJson(json);

      expect(code.id, 'ic1');
      expect(code.code, 'ABC12345');
      expect(code.status, InvitationStatus.available);
      expect(code.expiresAt, DateTime.parse('2024-06-01T00:00:00.000Z'));
      expect(code.remainingDays, 30);
    });

    test('fromJson handles all statuses', () {
      for (final status in InvitationStatus.values) {
        final json = {
          'id': 'ic1',
          'code': 'ABC12345',
          'status': status.name,
          'expiresAt': '2024-06-01T00:00:00.000Z',
          'remainingDays': 10,
        };
        final code = InvitationCode.fromJson(json);
        expect(code.status, status);
      }
    });

    test('roundtrip preserves data', () {
      final original = InvitationCode(
        id: 'ic1',
        code: 'ABC12345',
        status: InvitationStatus.used,
        expiresAt: DateTime.utc(2024, 6, 1),
        remainingDays: 0,
      );
      final restored = InvitationCode.fromJson(original.toJson());
      expect(restored, original);
    });
  });
}
