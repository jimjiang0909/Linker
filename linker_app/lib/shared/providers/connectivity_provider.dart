import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// 网络连接状态流 Provider
///
/// 使用 connectivity_plus 监听网络状态变化，
/// 返回当前网络连接类型列表。
final connectivityStreamProvider =
    StreamProvider<List<ConnectivityResult>>((ref) {
  return Connectivity().onConnectivityChanged;
});

/// 网络是否可用 Provider
///
/// 基于 [connectivityStreamProvider] 判断当前是否有网络连接。
/// 当连接类型不包含 none 时认为网络可用。
final isConnectedProvider = Provider<bool>((ref) {
  final connectivity = ref.watch(connectivityStreamProvider);
  return connectivity.when(
    data: (results) => !results.contains(ConnectivityResult.none),
    loading: () => true, // 加载中默认认为有网络
    error: (_, _) => true, // 出错时默认认为有网络
  );
});
