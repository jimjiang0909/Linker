import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../constants/api_constants.dart';
import '../storage/secure_storage.dart';

/// WebSocket 连接状态枚举
enum ConnectionStatus {
  /// 已连接
  connected,

  /// 连接中
  connecting,

  /// 已断开
  disconnected,

  /// 重连中
  reconnecting,
}

/// 新消息事件数据类
///
/// 当收到 'message:new' Socket.IO 事件时解析生成。
class NewMessageEvent {
  /// 对话 ID
  final String conversationId;

  /// 消息 ID
  final String messageId;

  /// 发送者 ID
  final String senderId;

  /// 消息内容
  final String content;

  /// 消息创建时间
  final DateTime createdAt;

  NewMessageEvent({
    required this.conversationId,
    required this.messageId,
    required this.senderId,
    required this.content,
    required this.createdAt,
  });

  /// 从 Socket.IO 回调数据中解析
  /// 后端发送格式: { message: { id, conversationId, senderId, content, createdAt } }
  factory NewMessageEvent.fromMap(Map<String, dynamic> data) {
    final msg = data.containsKey('message') && data['message'] is Map
        ? data['message'] as Map<String, dynamic>
        : data;
    return NewMessageEvent(
      conversationId: msg['conversationId'] as String,
      messageId: msg['id'] as String,
      senderId: msg['senderId'] as String,
      content: msg['content'] as String,
      createdAt: DateTime.parse(msg['createdAt'] as String),
    );
  }
}

/// 匹配成功事件数据类
///
/// 当收到 'match:success' Socket.IO 事件时解析生成。
class MatchSuccessEvent {
  /// 匹配 ID
  final String? matchId;

  /// 匹配对象用户 ID
  final String partnerId;

  /// 对话 ID（匹配成功后自动创建的对话）
  final String conversationId;

  MatchSuccessEvent({
    this.matchId,
    required this.partnerId,
    required this.conversationId,
  });

  /// 从 Socket.IO 回调数据中解析
  factory MatchSuccessEvent.fromMap(Map<String, dynamic> data) {
    return MatchSuccessEvent(
      matchId: data['matchId'] as String?,
      partnerId: data['partnerId'] as String,
      conversationId: data['conversationId'] as String,
    );
  }
}

/// 新推荐事件数据类
///
/// 当收到 'recommendation:new' Socket.IO 事件时解析生成。
/// 通知客户端有新的每日推荐可用。
class NewRecommendationEvent {
  /// 匹配 ID（可选，某些场景下后端可能不提供）
  final String? matchId;

  NewRecommendationEvent({this.matchId});

  /// 从 Socket.IO 回调数据中解析
  factory NewRecommendationEvent.fromMap(Map<String, dynamic> data) {
    return NewRecommendationEvent(
      matchId: data['matchId'] as String?,
    );
  }
}

/// Socket.IO 客户端封装
///
/// 管理 WebSocket 连接生命周期、事件监听、连接状态和自动重连。
/// 使用 Auth Token 进行认证，通过 StreamController 暴露连接状态流。
/// 断开连接时自动使用指数退避策略重连（1s→2s→4s→8s→16s→30s）。
///
/// 事件流：
/// - [onNewMessage] - 新消息事件流
/// - [onMatchSuccess] - 匹配成功事件流
/// - [onNewRecommendation] - 新推荐事件流
class WebSocketClient {
  final SecureStorage _storage;

  io.Socket? _socket;

  final StreamController<ConnectionStatus> _connectionStatusController =
      StreamController<ConnectionStatus>.broadcast();

  /// 新消息事件流控制器
  final StreamController<NewMessageEvent> _newMessageController =
      StreamController<NewMessageEvent>.broadcast();

  /// 匹配成功事件流控制器
  final StreamController<MatchSuccessEvent> _matchSuccessController =
      StreamController<MatchSuccessEvent>.broadcast();

  /// 新推荐事件流控制器
  final StreamController<NewRecommendationEvent> _newRecommendationController =
      StreamController<NewRecommendationEvent>.broadcast();

  ConnectionStatus _currentStatus = ConnectionStatus.disconnected;

  /// 重连相关字段
  int _reconnectAttempts = 0;
  Timer? _reconnectTimer;
  bool _shouldReconnect = false;

  /// 重连初始延迟（毫秒）
  static const int _initialDelayMs = 1000;

  /// 重连最大延迟（毫秒）
  static const int _maxDelayMs = 30000;

  /// 创建 WebSocketClient 实例
  WebSocketClient({required SecureStorage storage}) : _storage = storage;

  /// 连接状态流
  Stream<ConnectionStatus> get connectionStatus =>
      _connectionStatusController.stream;

  /// 当前连接状态
  ConnectionStatus get currentStatus => _currentStatus;

  /// 新消息事件流
  ///
  /// 当收到 'message:new' Socket.IO 事件时触发。
  Stream<NewMessageEvent> get onNewMessage => _newMessageController.stream;

  /// 匹配成功事件流
  ///
  /// 当收到 'match:success' Socket.IO 事件时触发。
  Stream<MatchSuccessEvent> get onMatchSuccess =>
      _matchSuccessController.stream;

  /// 新推荐事件流
  ///
  /// 当收到 'recommendation:new' Socket.IO 事件时触发。
  Stream<NewRecommendationEvent> get onNewRecommendation =>
      _newRecommendationController.stream;

  /// 建立 WebSocket 连接
  ///
  /// 从 SecureStorage 读取 Auth Token，使用 Token 进行认证连接。
  /// 如果没有 Token 则不进行连接。
  /// 连接成功后启用自动重连机制。
  Future<void> connect() async {
    // 如果已经连接或正在连接，直接返回
    if (_currentStatus == ConnectionStatus.connected ||
        _currentStatus == ConnectionStatus.connecting) {
      return;
    }

    final token = await _storage.getToken();
    if (token == null || token.isEmpty) {
      return;
    }

    _shouldReconnect = true;
    _updateStatus(ConnectionStatus.connecting);

    _socket = io.io(
      ApiConstants.wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket'])
          .disableAutoConnect()
          .setAuth({'token': token})
          .setExtraHeaders({'Authorization': 'Bearer $token'})
          .build(),
    );

    _setupEventListeners();
    _socket!.connect();
  }

  /// 断开 WebSocket 连接并清理资源
  ///
  /// 停止自动重连，清理所有监听器和定时器。
  void disconnect() {
    _stopReconnect();
    _socket?.clearListeners();
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _updateStatus(ConnectionStatus.disconnected);
  }

  /// 发送消息
  ///
  /// 通过 Socket.IO 发送消息到指定对话。
  /// [onAck] 回调在服务端确认后触发，返回服务端的消息数据。
  void sendMessage({
    required String conversationId,
    required String content,
    void Function(Map<String, dynamic>)? onAck,
  }) {
    if (_currentStatus != ConnectionStatus.connected || _socket == null) {
      onAck?.call({'error': {'code': 'NOT_CONNECTED', 'message': 'WebSocket not connected'}});
      return;
    }

    _socket!.emitWithAck('message:send', {
      'conversationId': conversationId,
      'content': content,
    }, ack: (data) {
      if (onAck == null) return;
      // socket_io_client may wrap ack data in a List
      final Map<String, dynamic> response;
      if (data is Map<String, dynamic>) {
        response = data;
      } else if (data is List && data.isNotEmpty && data.first is Map<String, dynamic>) {
        response = data.first as Map<String, dynamic>;
      } else {
        response = {'error': {'code': 'INVALID_ACK', 'message': 'Unexpected ack format'}};
      }
      onAck(response);
    });
  }

  /// 处理离线消息中的单条事件
  void _handleOfflineEvent(String event, Map<String, dynamic> data) {
    switch (event) {
      case 'message:new':
        final msgEvent = NewMessageEvent.fromMap(data);
        if (!_newMessageController.isClosed) {
          _newMessageController.add(msgEvent);
        }
        break;
      case 'match:success':
        final matchEvent = MatchSuccessEvent.fromMap(data);
        if (!_matchSuccessController.isClosed) {
          _matchSuccessController.add(matchEvent);
        }
        break;
      case 'recommendation:new':
        final recEvent = NewRecommendationEvent.fromMap(data);
        if (!_newRecommendationController.isClosed) {
          _newRecommendationController.add(recEvent);
        }
        break;
    }
  }

  /// 释放资源
  ///
  /// 断开连接并关闭所有事件流控制器。
  void dispose() {
    disconnect();
    _connectionStatusController.close();
    _newMessageController.close();
    _matchSuccessController.close();
    _newRecommendationController.close();
  }

  /// 设置基础事件监听器
  void _setupEventListeners() {
    _socket!.onConnect((_) {
      // 连接成功，重置重连计数
      _reconnectAttempts = 0;
      _updateStatus(ConnectionStatus.connected);
    });

    _socket!.onDisconnect((_) {
      _updateStatus(ConnectionStatus.disconnected);
      // 连接断开时触发自动重连
      _startReconnect();
    });

    _socket!.onConnectError((_) {
      _updateStatus(ConnectionStatus.disconnected);
      // 连接错误时触发自动重连
      _startReconnect();
    });

    _socket!.onError((_) {
      _updateStatus(ConnectionStatus.disconnected);
      // 错误时触发自动重连
      _startReconnect();
    });

    // 监听新消息事件
    _socket!.on('message:new', (data) {
      if (data is Map<String, dynamic>) {
        final event = NewMessageEvent.fromMap(data);
        if (!_newMessageController.isClosed) {
          _newMessageController.add(event);
        }
      }
    });

    // 监听匹配成功事件
    _socket!.on('match:success', (data) {
      if (data is Map<String, dynamic>) {
        final event = MatchSuccessEvent.fromMap(data);
        if (!_matchSuccessController.isClosed) {
          _matchSuccessController.add(event);
        }
      }
    });

    // 监听新推荐事件
    _socket!.on('recommendation:new', (data) {
      final map = data is Map<String, dynamic> ? data : <String, dynamic>{};
      final event = NewRecommendationEvent.fromMap(map);
      if (!_newRecommendationController.isClosed) {
        _newRecommendationController.add(event);
      }
    });

    // 监听离线消息批量推送事件，确认后后端会删除已投递的离线消息
    _socket!.on('offline:batch', (rawData) {
      // socket_io_client may pass [data, ackFn] as a single list argument
      Map<String, dynamic>? data;
      Function? ack;
      if (rawData is Map<String, dynamic>) {
        data = rawData;
      } else if (rawData is List) {
        for (final item in rawData) {
          if (item is Map<String, dynamic>) data = item;
          if (item is Function) ack = item;
        }
      }

      if (data != null && data['messages'] is List) {
        final messages = data['messages'] as List;
        for (final msg in messages) {
          if (msg is Map<String, dynamic>) {
            final event = msg['event'] as String?;
            final eventData = msg['data'];
            if (event != null && eventData is Map<String, dynamic>) {
              _handleOfflineEvent(event, eventData);
            }
          }
        }
      }
      // Send acknowledgement to backend
      if (ack != null) {
        ack({'received': true});
      }
    });
  }

  /// 启动自动重连
  ///
  /// 使用指数退避策略计算延迟：min(2^attempts * 1000, 30000) 毫秒
  /// 延迟序列：1s → 2s → 4s → 8s → 16s → 30s（封顶）
  void _startReconnect() {
    // 如果不应该重连或已经在重连中，直接返回
    if (!_shouldReconnect) return;
    if (_reconnectTimer?.isActive ?? false) return;

    _updateStatus(ConnectionStatus.reconnecting);

    // 计算指数退避延迟
    final delayMs = min(
      (pow(2, _reconnectAttempts) * _initialDelayMs).toInt(),
      _maxDelayMs,
    );

    _reconnectTimer = Timer(Duration(milliseconds: delayMs), () async {
      if (!_shouldReconnect) return;

      _reconnectAttempts++;

      // 清理旧的 socket 连接
      _socket?.clearListeners();
      _socket?.dispose();
      _socket = null;

      // 重新建立连接
      final token = await _storage.getToken();
      if (token == null || token.isEmpty) {
        _stopReconnect();
        _updateStatus(ConnectionStatus.disconnected);
        return;
      }

      _socket = io.io(
        ApiConstants.wsUrl,
        io.OptionBuilder()
            .setTransports(['websocket'])
            .disableAutoConnect()
            .setAuth({'token': token})
            .setExtraHeaders({'Authorization': 'Bearer $token'})
            .build(),
      );

      _setupEventListeners();
      _socket!.connect();
    });
  }

  /// 停止自动重连
  ///
  /// 取消重连定时器，重置重连状态。
  void _stopReconnect() {
    _shouldReconnect = false;
    _reconnectTimer?.cancel();
    _reconnectTimer = null;
    _reconnectAttempts = 0;
  }

  /// 更新连接状态并通知监听者
  void _updateStatus(ConnectionStatus status) {
    if (_currentStatus == status) return;
    _currentStatus = status;
    if (!_connectionStatusController.isClosed) {
      _connectionStatusController.add(status);
    }
  }
}

/// WebSocketClient 的 Riverpod Provider
final webSocketClientProvider = Provider<WebSocketClient>((ref) {
  final storage = ref.watch(secureStorageProvider);
  final client = WebSocketClient(storage: storage);

  ref.onDispose(() {
    client.dispose();
  });

  return client;
});
