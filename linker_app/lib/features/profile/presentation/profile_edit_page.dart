import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/constants/profile_options.dart';
import '../../../core/utils/error_utils.dart';
import '../../../core/utils/validators.dart';
import '../../../shared/models/profile.dart';
import '../data/profile_repository.dart';
import '../providers/profile_provider.dart';
import 'widgets/photo_grid_widget.dart';

/// 资料编辑页面
///
/// 用户编辑已有个人资料的页面。
/// 与 [ProfileSetupPage] 共享相同的表单结构，但有以下区别：
/// - AppBar 标题为 "编辑资料"
/// - 进入页面时预填充当前已保存的资料信息
/// - 包含照片网格展示（使用 PhotoGridWidget）
/// - 保存成功后 pop 返回上一页
class ProfileEditPage extends ConsumerStatefulWidget {
  const ProfileEditPage({super.key});

  @override
  ConsumerState<ProfileEditPage> createState() => _ProfileEditPageState();
}

class _ProfileEditPageState extends ConsumerState<ProfileEditPage> {
  final _formKey = GlobalKey<FormState>();

  final _nameController = TextEditingController();
  final _cityController = TextEditingController();
  final _bioController = TextEditingController();

  /// 选中的出生年份
  int? _selectedBirthYear;

  /// 选中的性别
  Gender _selectedGender = Gender.male;

  /// 选中的职业
  String? _selectedOccupation;

  /// 是否已完成数据预填充
  bool _isDataPopulated = false;

  /// 是否正在执行更新操作（区分 fetch 和 update）
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    // 获取当前用户资料
    Future.microtask(() {
      ref.read(profileProvider.notifier).fetchProfile();
    });
  }

  @override
  void dispose() {
    _nameController.dispose();
    _cityController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  /// 将 Profile 数据填充到表单控件中
  void _populateFormData(Profile profile) {
    _nameController.text = profile.name;
    _cityController.text = profile.city;
    _bioController.text = profile.bio ?? '';
    _selectedBirthYear = profile.birthYear;
    _selectedGender = profile.gender;
    _selectedOccupation = ProfileOptions.occupations.contains(profile.occupation)
        ? profile.occupation
        : null;
    _isDataPopulated = true;
  }

  /// 计算可选出生年份范围（18-60岁）
  List<int> get _availableBirthYears {
    final currentYear = DateTime.now().year;
    final minYear = currentYear - 60;
    final maxYear = currentYear - 18;
    return List.generate(maxYear - minYear + 1, (i) => maxYear - i);
  }

  /// 提交资料更新
  Future<void> _onSave() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (_selectedBirthYear == null) return;
    if (_selectedOccupation == null) return;

    final request = ProfileUpdateRequest(
      name: _nameController.text.trim(),
      birthYear: _selectedBirthYear!,
      gender: _selectedGender.name,
      occupation: _selectedOccupation!,
      city: _cityController.text.trim(),
      bio: _bioController.text.trim().isEmpty
          ? null
          : _bioController.text.trim(),
    );

    _isSaving = true;
    await ref.read(profileProvider.notifier).updateProfile(request);
    _isSaving = false;
  }

  @override
  Widget build(BuildContext context) {
    final profileState = ref.watch(profileProvider);
    final isLoading = profileState is AsyncLoading;

    // 监听 profileProvider 状态变化
    ref.listen<AsyncValue<Profile?>>(profileProvider, (previous, next) {
      // 获取成功后预填充数据
      if (next is AsyncData<Profile?> &&
          next.value != null &&
          !_isDataPopulated) {
        setState(() {
          _populateFormData(next.value!);
        });
      }

      // 更新成功后 pop 返回
      if (_isSaving &&
          previous is AsyncLoading &&
          next is AsyncData<Profile?> &&
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
        title: const Text(AppStrings.profileEdit),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSizes.spacingLg,
                vertical: AppSizes.spacingMd,
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // 照片网格展示
                    _buildPhotoGridSection(profileState),

                    const SizedBox(height: AppSizes.spacingLg),

                    // 姓名输入框
                    _buildNameField(),

                    const SizedBox(height: AppSizes.spacingMd),

                    // 出生年份选择器
                    _buildBirthYearPicker(),

                    const SizedBox(height: AppSizes.spacingMd),

                    // 性别选择
                    _buildGenderSelector(),

                    const SizedBox(height: AppSizes.spacingMd),

                    // 职业输入框
                    _buildOccupationField(),

                    const SizedBox(height: AppSizes.spacingMd),

                    // 城市输入框
                    _buildCityField(),

                    const SizedBox(height: AppSizes.spacingMd),

                    // 自我介绍
                    _buildBioField(),

                    const SizedBox(height: AppSizes.spacingLg),
                  ],
                ),
              ),
            ),
          ),

          // 底部保存按钮
          _buildSaveButton(isLoading),
        ],
      ),
    );
  }

  /// 照片网格展示区域
  Widget _buildPhotoGridSection(AsyncValue<Profile?> profileState) {
    final photos = profileState.value?.photos ?? [];
    return PhotoGridWidget(photos: photos);
  }

  /// 姓名输入框
  Widget _buildNameField() {
    return TextFormField(
      controller: _nameController,
      decoration: const InputDecoration(
        labelText: AppStrings.nameHint,
        prefixIcon: Icon(Icons.person_outline),
        border: OutlineInputBorder(),
      ),
      maxLength: 20,
      textInputAction: TextInputAction.next,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: Validators.validateName,
    );
  }

  /// 出生年份选择器
  Widget _buildBirthYearPicker() {
    return DropdownButtonFormField<int>(
      initialValue: _selectedBirthYear,
      decoration: const InputDecoration(
        labelText: 'Birth Year',
        prefixIcon: Icon(Icons.cake_outlined),
        border: OutlineInputBorder(),
      ),
      items: _availableBirthYears
          .map((year) => DropdownMenuItem(
                value: year,
                child: Text('$year'),
              ))
          .toList(),
      onChanged: (value) {
        setState(() {
          _selectedBirthYear = value;
        });
      },
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: (value) => Validators.validateBirthYear(value),
    );
  }

  /// 性别选择器
  Widget _buildGenderSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Gender',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: AppSizes.spacingSm),
        SegmentedButton<Gender>(
          segments: const [
            ButtonSegment(
              value: Gender.male,
              label: Text('Male'),
              icon: Icon(Icons.male),
            ),
            ButtonSegment(
              value: Gender.female,
              label: Text('Female'),
              icon: Icon(Icons.female),
            ),
            ButtonSegment(
              value: Gender.other,
              label: Text('Other'),
              icon: Icon(Icons.transgender),
            ),
          ],
          selected: {_selectedGender},
          onSelectionChanged: (selected) {
            setState(() {
              _selectedGender = selected.first;
            });
          },
        ),
      ],
    );
  }

  /// 职业选择器（ChoiceChip）
  Widget _buildOccupationField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Occupation',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: AppSizes.spacingSm),
        Wrap(
          spacing: AppSizes.spacingSm,
          runSpacing: AppSizes.spacingXs,
          children: ProfileOptions.occupations.map((occupation) {
            final selected = _selectedOccupation == occupation;
            return ChoiceChip(
              label: Text(occupation),
              selected: selected,
              onSelected: (value) {
                setState(() {
                  _selectedOccupation = value ? occupation : null;
                });
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  /// 城市搜索选择器（Autocomplete）
  Widget _buildCityField() {
    return Autocomplete<String>(
      initialValue: TextEditingValue(text: _cityController.text),
      optionsBuilder: (textEditingValue) {
        if (textEditingValue.text.isEmpty) return const Iterable<String>.empty();
        final query = textEditingValue.text.toLowerCase();
        return ProfileOptions.cities
            .where((city) => city.toLowerCase().contains(query))
            .take(10);
      },
      onSelected: (value) {
        _cityController.text = value;
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        if (controller.text.isEmpty && _cityController.text.isNotEmpty) {
          controller.text = _cityController.text;
        }
        return TextFormField(
          controller: controller,
          focusNode: focusNode,
          decoration: const InputDecoration(
            labelText: AppStrings.cityHint,
            prefixIcon: Icon(Icons.location_city_outlined),
            border: OutlineInputBorder(),
          ),
          textInputAction: TextInputAction.next,
          autovalidateMode: AutovalidateMode.onUserInteraction,
          validator: (value) {
            if (value == null || value.trim().isEmpty) return 'City is required';
            if (value.trim().length > 100) return 'City name is too long';
            return null;
          },
          onChanged: (value) {
            _cityController.text = value;
          },
        );
      },
    );
  }

  /// 自我介绍多行输入框
  Widget _buildBioField() {
    return TextFormField(
      controller: _bioController,
      decoration: const InputDecoration(
        labelText: AppStrings.bioHint,
        prefixIcon: Icon(Icons.edit_note),
        border: OutlineInputBorder(),
        alignLabelWithHint: true,
      ),
      maxLength: 500,
      maxLines: 4,
      minLines: 3,
      textInputAction: TextInputAction.newline,
      keyboardType: TextInputType.multiline,
      autovalidateMode: AutovalidateMode.onUserInteraction,
      validator: Validators.validateBio,
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
