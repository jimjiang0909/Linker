import 'package:flutter/material.dart';

import '../../../../core/constants/app_colors.dart';
import '../../../../core/constants/app_sizes.dart';
import '../../../../core/constants/app_strings.dart';

/// 举报原因选择面板
///
/// 以 BottomSheet 形式展示举报原因列表，
/// 用户选择原因后返回选中的原因字符串。
class ReportBottomSheet extends StatelessWidget {
  const ReportBottomSheet({super.key});

  /// 举报原因列表
  static const List<String> _reasons = [
    'Inappropriate language',
    'Harassment',
    'Fake information',
    'Spam/Advertising',
    'Explicit content',
    'Other',
  ];

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // 标题栏
          Padding(
            padding: const EdgeInsets.all(AppSizes.spacingMd),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    AppStrings.reportReason,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close),
                  iconSize: AppSizes.iconMd,
                ),
              ],
            ),
          ),
          const Divider(height: AppSizes.dividerThickness),
          // 原因列表
          ...List.generate(_reasons.length, (index) {
            return ListTile(
              title: Text(_reasons[index]),
              trailing: const Icon(
                Icons.chevron_right,
                color: AppColors.textHint,
              ),
              onTap: () {
                Navigator.of(context).pop(_reasons[index]);
              },
            );
          }),
          const SizedBox(height: AppSizes.spacingMd),
        ],
      ),
    );
  }
}
