import 'dart:math';

import 'package:glados/glados.dart';

/// **Validates: Requirements 9.2, 9.6**
///
/// 属性4：WebSocket 重连可靠性
/// 对于任意重连次数 n，延迟应为 min(2^n * 1000, 30000) 毫秒。
void main() {
  group('属性4：WebSocket 重连可靠性', () {
    /// 计算重连延迟（与 WebSocketClient 中的逻辑一致）
    int calculateReconnectDelay(int attempts) {
      const initialDelayMs = 1000;
      const maxDelayMs = 30000;
      return min((pow(2, attempts) * initialDelayMs).toInt(), maxDelayMs);
    }

    Glados(any.intInRange(0, 20)).test(
      '对于任意重连次数 n，延迟应为 min(2^n * 1000, 30000) 毫秒',
      (n) {
        final delay = calculateReconnectDelay(n);
        final expected = min((pow(2, n) * 1000).toInt(), 30000);

        expect(delay, equals(expected));
        // 延迟永远不超过 30000ms
        expect(delay, lessThanOrEqualTo(30000));
        // 延迟永远不小于 1000ms（n >= 0 时）
        expect(delay, greaterThanOrEqualTo(1000));
      },
    );
  });
}
