import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/utils/error_utils.dart';
import '../data/preferences_repository.dart';
import '../providers/preferences_provider.dart';

/// 偏好编辑页面
///
/// 用户编辑已保存的偏好设置。
/// 与 [PreferencesSetupPage] 共享相同的表单结构，但有以下区别：
/// - AppBar 标题为 "编辑偏好"
/// - 进入页面时调用 fetchPreferences 获取数据并预填充
/// - 保存成功后 pop 返回上一页
class PreferencesEditPage extends ConsumerStatefulWidget {
  const PreferencesEditPage({super.key});

  @override
  ConsumerState<PreferencesEditPage> createState() =>
      _PreferencesEditPageState();
}

class _PreferencesEditPageState extends ConsumerState<PreferencesEditPage> {
  /// 年龄范围
  RangeValues _ageRange = const RangeValues(20, 35);

  /// 交友意图
  String? _selectedIntent;

  /// 已选职业类型
  Set<String> _selectedOccupations = {};

  /// 已选性格特征
  Set<String> _selectedPersonalities = {};

  /// 是否已完成数据预填充
  bool _isDataPopulated = false;

  /// 是否正在执行保存操作
  bool _isSaving = false;

  /// 交友意图选项
  static const List<Map<String, String>> _intentOptions = [
    {'value': 'serious_dating', 'label': 'Serious Dating'},
    {'value': 'casual', 'label': 'Casual'},
    {'value': 'friendship', 'label': 'Make Friends'},
  ];

  /// 职业类型选项
  static const List<String> _occupationOptions = [
    'Tech',
    'Finance',
    'Education',
    'Healthcare',
    'Design',
    'Legal',
    'Media',
    'Sales',
    'Management',
    'Other',
  ];

  /// 性格特征选项
  static const List<String> _personalityOptions = [
    'Outgoing',
    'Introverted',
    'Humorous',
    'Gentle',
    'Independent',
    'Romantic',
    'Rational',
    'Emotional',
    'Adventurous',
    'Steady',
  ];

  /// 多选上限
  static const int _maxSelections = 5;

  @override
  void initState() {
    super.initState();
    // 获取当前偏好设置
    Future.microtask(() {
      ref.read(preferencesProvider.notifier).fetchPreferences();
    });
  }

  /// 将 Preferences 数据填充到表单控件中
  void _populateFormData(Preferences preferences) {
    _ageRange = RangeValues(
      preferences.ageMin.toDouble(),
      preferences.ageMax.toDouble(),
    );
    _selectedIntent = preferences.datingIntent;
    _selectedOccupations = Set<String>.from(preferences.occupationTypes);
    _selectedPersonalities = Set<String>.from(preferences.personalityTraits);
    _isDataPopulated = true;
  }

  /// 提交偏好设置更新
  Future<void> _onSave() async {
    if (_selectedIntent == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select what you\'re looking for')),
      );
      return;
    }
    if (_selectedOccupations.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one occupation')),
      );
      return;
    }
    if (_selectedPersonalities.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one trait')),
      );
      return;
    }

    final request = PreferencesUpdateRequest(
      ageMin: _ageRange.start.round(),
      ageMax: _ageRange.end.round(),
      datingIntent: _selectedIntent!,
      occupationTypes: _selectedOccupations.toList(),
      personalityTraits: _selectedPersonalities.toList(),
    );

    _isSaving = true;
    await ref.read(preferencesProvider.notifier).updatePreferences(request);
    _isSaving = false;
  }

  @override
  Widget build(BuildContext context) {
    final preferencesState = ref.watch(preferencesProvider);
    final isLoading = preferencesState is AsyncLoading;

    // 监听状态变化
    ref.listen<AsyncValue<Preferences?>>(preferencesProvider,
        (previous, next) {
      // 获取成功后预填充数据
      if (next is AsyncData<Preferences?> &&
          next.value != null &&
          !_isDataPopulated) {
        setState(() {
          _populateFormData(next.value!);
        });
      }

      // 更新成功后 pop 返回
      if (_isSaving &&
          previous is AsyncLoading &&
          next is AsyncData<Preferences?> &&
          next.value != null) {
        Navigator.of(context).pop();
      }

      // 错误状态展示 SnackBar
      if (next is AsyncError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(getErrorMessage(next.error!)),
            backgroundColor: Theme.of(context).colorScheme.error,
            behavior: SnackBarBehavior.floating,
          ),
        );
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text(AppStrings.preferencesEdit),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSizes.spacingLg,
                vertical: AppSizes.spacingMd,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // 年龄范围滑块
                  _buildAgeRangeSlider(),

                  const SizedBox(height: AppSizes.spacingLg),

                  // 交友意图单选
                  _buildDatingIntentSelector(),

                  const SizedBox(height: AppSizes.spacingLg),

                  // 职业类型多选
                  _buildOccupationTypeSelector(),

                  const SizedBox(height: AppSizes.spacingLg),

                  // 性格特征多选
                  _buildPersonalityTraitSelector(),

                  const SizedBox(height: AppSizes.spacingLg),
                ],
              ),
            ),
          ),

          // 底部保存按钮
          _buildSaveButton(isLoading),
        ],
      ),
    );
  }

  /// 年龄范围双端滑块
  Widget _buildAgeRangeSlider() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${AppStrings.ageRange}: ${_ageRange.start.round()} - ${_ageRange.end.round()}',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: AppSizes.spacingSm),
        RangeSlider(
          values: _ageRange,
          min: 18,
          max: 60,
          divisions: 42,
          labels: RangeLabels(
            '${_ageRange.start.round()}',
            '${_ageRange.end.round()}',
          ),
          onChanged: (values) {
            setState(() {
              _ageRange = values;
            });
          },
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSizes.spacingMd),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '18',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              Text(
                '60',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  /// 交友意图单选组件
  Widget _buildDatingIntentSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          AppStrings.datingIntent,
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: AppSizes.spacingSm),
        Wrap(
          spacing: AppSizes.spacingSm,
          children: _intentOptions.map((option) {
            final isSelected = _selectedIntent == option['value'];
            return ChoiceChip(
              label: Text(option['label']!),
              selected: isSelected,
              onSelected: (selected) {
                setState(() {
                  _selectedIntent = selected ? option['value'] : null;
                });
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  /// 职业类型多选标签组件
  Widget _buildOccupationTypeSelector() {
    final isAtLimit = _selectedOccupations.length >= _maxSelections;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              AppStrings.occupationTypes,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(width: AppSizes.spacingSm),
            Text(
              '(${_selectedOccupations.length}/$_maxSelections)',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: isAtLimit
                        ? Theme.of(context).colorScheme.error
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        if (isAtLimit) ...[
          const SizedBox(height: AppSizes.spacingXs),
          Text(
            AppStrings.selectionLimitReached,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
          ),
        ],
        const SizedBox(height: AppSizes.spacingSm),
        Wrap(
          spacing: AppSizes.spacingSm,
          runSpacing: AppSizes.spacingSm,
          children: _occupationOptions.map((option) {
            final isSelected = _selectedOccupations.contains(option);
            return FilterChip(
              label: Text(option),
              selected: isSelected,
              onSelected: (isAtLimit && !isSelected)
                  ? null
                  : (selected) {
                      setState(() {
                        if (selected) {
                          _selectedOccupations.add(option);
                        } else {
                          _selectedOccupations.remove(option);
                        }
                      });
                    },
            );
          }).toList(),
        ),
      ],
    );
  }

  /// 性格特征多选标签组件
  Widget _buildPersonalityTraitSelector() {
    final isAtLimit = _selectedPersonalities.length >= _maxSelections;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              AppStrings.personalityTraits,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(width: AppSizes.spacingSm),
            Text(
              '(${_selectedPersonalities.length}/$_maxSelections)',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: isAtLimit
                        ? Theme.of(context).colorScheme.error
                        : Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
        if (isAtLimit) ...[
          const SizedBox(height: AppSizes.spacingXs),
          Text(
            AppStrings.selectionLimitReached,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.error,
                ),
          ),
        ],
        const SizedBox(height: AppSizes.spacingSm),
        Wrap(
          spacing: AppSizes.spacingSm,
          runSpacing: AppSizes.spacingSm,
          children: _personalityOptions.map((option) {
            final isSelected = _selectedPersonalities.contains(option);
            return FilterChip(
              label: Text(option),
              selected: isSelected,
              onSelected: (isAtLimit && !isSelected)
                  ? null
                  : (selected) {
                      setState(() {
                        if (selected) {
                          _selectedPersonalities.add(option);
                        } else {
                          _selectedPersonalities.remove(option);
                        }
                      });
                    },
            );
          }).toList(),
        ),
      ],
    );
  }

  /// 底部保存按钮
  Widget _buildSaveButton(bool isLoading) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(AppSizes.spacingLg),
        child: SizedBox(
          width: double.infinity,
          height: AppSizes.buttonHeightLg,
          child: FilledButton(
            onPressed: isLoading ? null : _onSave,
            child: isLoading
                ? const SizedBox(
                    width: AppSizes.iconMd,
                    height: AppSizes.iconMd,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Text(
                    AppStrings.save,
                    style: TextStyle(fontSize: AppSizes.fontLg),
                  ),
          ),
        ),
      ),
    );
  }
}
