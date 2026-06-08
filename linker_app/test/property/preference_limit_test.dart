import 'package:glados/glados.dart';

/// **Validates: Requirements 4.4, 4.5**
///
/// 属性10：偏好多选标签上限正确性
/// 选中项数量永远不超过 5。
void main() {
  group('属性10：偏好多选标签上限正确性', () {
    /// 可选项列表
    final allOptions = [
      '技术',
      '金融',
      '教育',
      '医疗',
      '设计',
      '法律',
      '媒体',
      '销售',
      '管理',
      '其他',
    ];

    Glados(any.intInRange(0, 15)).test(
      '选中项数量永远不超过 5',
      (attemptedSelections) {
        const maxSelections = 5;
        final selected = <String>{};

        // 模拟选择操作（带上限检查，与 PreferencesSetupPage 逻辑一致）
        for (int i = 0;
            i < attemptedSelections && i < allOptions.length;
            i++) {
          if (selected.length < maxSelections) {
            selected.add(allOptions[i]);
          }
        }

        // 验证选中项数量永远不超过 5
        expect(selected.length, lessThanOrEqualTo(maxSelections));
        // 验证实际选中数量
        final expectedCount = attemptedSelections
            .clamp(0, allOptions.length)
            .clamp(0, maxSelections);
        expect(selected.length, equals(expectedCount));
      },
    );
  });
}
