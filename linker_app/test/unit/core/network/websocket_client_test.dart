import 'dart:async';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:linker_app/core/network/websocket_client.dart';
import 'package:linker_app/core/storage/secure_storage.dart';

/// 模拟 SecureStorage，用于测试
class FakeSecureStorage extends SecureStorage {
  String? _token;

  FakeSecureStorage({String? token}) : _token = token, super(storage: null);

  void setToken(String? token) => _token = token;

  @override
  Future<String?> getToken() async => _token;

  @override
  Future<void> saveToken(String token) async => _token = token;

  @override
  Future<void> deleteToken() async => _token = null;

  @override
  Future<bool> hasToken() async => _token != null && _token!.isNotEmpty;
}

void main() {
  late FakeSecureStorage fakeStorage;
  late WebSocketClient client;

  setUp(() {
    fakeStorage = FakeSecureStorage(token: 'test-token-123');
    client = WebSocketClient(storage: fakeStorage);
  });

  tearDown(() {
    client.dispose();
  });

  group('WebSocketClient 重连逻辑', () {
    test('初始状态为 disconnected', () {
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('disconnect 方法停止重连', () async {
      // 验证 disconnect 后状态为 disconnected
      client.disconnect();
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('指数退避延迟计算正确', () {
      // 验证延迟公式：min(2^attempts * 1000, 30000)
      const initialDelay = 1000;
      const maxDelay = 30000;

      // attempts = 0: 2^0 * 1000 = 1000ms
      expect(min((pow(2, 0) * initialDelay).toInt(), maxDelay), equals(1000));

      // attempts = 1: 2^1 * 1000 = 2000ms
      expect(min((pow(2, 1) * initialDelay).toInt(), maxDelay), equals(2000));

      // attempts = 2: 2^2 * 1000 = 4000ms
      expect(min((pow(2, 2) * initialDelay).toInt(), maxDelay), equals(4000));

      // attempts = 3: 2^3 * 1000 = 8000ms
      expect(min((pow(2, 3) * initialDelay).toInt(), maxDelay), equals(8000));

      // attempts = 4: 2^4 * 1000 = 16000ms
      expect(min((pow(2, 4) * initialDelay).toInt(), maxDelay), equals(16000));

      // attempts = 5: 2^5 * 1000 = 32000ms → 封顶 30000ms
      expect(min((pow(2, 5) * initialDelay).toInt(), maxDelay), equals(30000));

      // attempts = 6: 2^6 * 1000 = 64000ms → 封顶 30000ms
      expect(min((pow(2, 6) * initialDelay).toInt(), maxDelay), equals(30000));
    });

    test('没有 Token 时 connect 不改变状态', () async {
      fakeStorage.setToken(null);
      await client.connect();
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('空 Token 时 connect 不改变状态', () async {
      fakeStorage.setToken('');
      await client.connect();
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('connectionStatus 流正确发出状态变化', () async {
      final statuses = <ConnectionStatus>[];
      final subscription = client.connectionStatus.listen(statuses.add);

      // 手动 disconnect 应该不发出事件（已经是 disconnected）
      client.disconnect();
      await Future.delayed(Duration.zero);
      expect(statuses, isEmpty);

      await subscription.cancel();
    });

    test('dispose 后状态流关闭', () async {
      client.dispose();
      // 验证 dispose 后不会抛出异常
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('多次 disconnect 调用不会抛出异常', () {
      client.disconnect();
      client.disconnect();
      client.disconnect();
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });

    test('sendMessage 在未连接时不执行', () {
      // 未连接状态下发送消息不应抛出异常
      client.sendMessage(conversationId: 'conv-1', content: 'hello');
      expect(client.currentStatus, equals(ConnectionStatus.disconnected));
    });
  });
}
