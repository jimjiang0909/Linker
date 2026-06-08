import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_sizes.dart';
import '../../../core/constants/app_strings.dart';
import '../../../core/utils/error_utils.dart';
import '../../../core/utils/validators.dart';
import '../providers/auth_provider.dart';

/// Auth page supporting both Sign Up and Log In modes.
///
/// Sign Up: invite code + email + verification code
/// Log In: email + verification code (no invite code needed)
class AuthPage extends ConsumerStatefulWidget {
  const AuthPage({super.key});

  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  final _formKey = GlobalKey<FormState>();

  final _invitationCodeController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  /// Whether we're in login mode (true) or sign up mode (false)
  bool _isLoginMode = false;

  @override
  void dispose() {
    _invitationCodeController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _onSubmit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    if (_isLoginMode) {
      await ref.read(authProvider.notifier).login(
            email: _emailController.text.trim(),
            password: _passwordController.text,
          );
    } else {
      await ref.read(authProvider.notifier).register(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            invitationCode: _invitationCodeController.text.trim(),
          );
    }
  }

  void _toggleMode() {
    setState(() {
      _isLoginMode = !_isLoginMode;
      _formKey.currentState?.reset();
    });
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final isLoading = authState is AsyncLoading;

    ref.listen<AsyncValue<void>>(authProvider, (previous, next) {
      if (next is AsyncError) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(getErrorMessage(next.error)),
            backgroundColor: Theme.of(context).colorScheme.error,
            behavior: SnackBarBehavior.floating,
            margin: const EdgeInsets.all(AppSizes.spacingMd),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppSizes.radiusMd),
            ),
          ),
        );
      }
    });

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSizes.spacingLg,
          ),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const SizedBox(height: AppSizes.spacingXxl),
                _buildHeader(),
                const SizedBox(height: AppSizes.spacingXl),

                // Invite code field (only in sign up mode)
                if (!_isLoginMode) ...[
                  _buildInvitationCodeField(),
                  const SizedBox(height: AppSizes.spacingMd),
                ],

                _buildEmailField(),
                const SizedBox(height: AppSizes.spacingMd),
                _buildPasswordField(),
                const SizedBox(height: AppSizes.spacingXl),
                _buildSubmitButton(isLoading),
                const SizedBox(height: AppSizes.spacingMd),
                _buildModeToggle(),
                const SizedBox(height: AppSizes.spacingXxl),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        Icon(
          Icons.people_alt_rounded,
          size: AppSizes.iconXl * 2,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: AppSizes.spacingMd),
        Text(
          AppStrings.appName,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.bold,
                color: Theme.of(context).colorScheme.primary,
              ),
        ),
        const SizedBox(height: AppSizes.spacingSm),
        Text(
          _isLoginMode ? 'Welcome back' : 'Create your account',
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      ],
    );
  }

  Widget _buildInvitationCodeField() {
    return TextFormField(
      controller: _invitationCodeController,
      decoration: const InputDecoration(
        labelText: AppStrings.invitationCodeHint,
        prefixIcon: Icon(Icons.card_giftcard),
      ),
      maxLength: 8,
      textInputAction: TextInputAction.next,
      validator: _isLoginMode ? null : Validators.validateInvitationCode,
      inputFormatters: Validators.invitationCodeInputFormatters,
      autovalidateMode: AutovalidateMode.onUserInteraction,
    );
  }

  Widget _buildEmailField() {
    return TextFormField(
      controller: _emailController,
      decoration: const InputDecoration(
        labelText: AppStrings.emailHint,
        prefixIcon: Icon(Icons.email_outlined),
      ),
      keyboardType: TextInputType.emailAddress,
      textInputAction: TextInputAction.next,
      validator: Validators.validateEmail,
      autovalidateMode: AutovalidateMode.onUserInteraction,
    );
  }

  Widget _buildPasswordField() {
    return TextFormField(
      controller: _passwordController,
      decoration: const InputDecoration(
        labelText: 'Password',
        prefixIcon: Icon(Icons.lock_outline),
      ),
      obscureText: true,
      textInputAction: TextInputAction.done,
      validator: (value) {
        if (value == null || value.isEmpty) return 'Password is required';
        if (value.length < 6) return 'At least 6 characters';
        return null;
      },
      autovalidateMode: AutovalidateMode.onUserInteraction,
    );
  }

  Widget _buildSubmitButton(bool isLoading) {
    return SizedBox(
      height: AppSizes.buttonHeightLg,
      child: FilledButton(
        onPressed: isLoading ? null : _onSubmit,
        child: isLoading
            ? const SizedBox(
                width: AppSizes.iconMd,
                height: AppSizes.iconMd,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                _isLoginMode ? 'Log In' : AppStrings.register,
                style: const TextStyle(fontSize: AppSizes.fontLg),
              ),
      ),
    );
  }

  Widget _buildModeToggle() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          _isLoginMode
              ? "Don't have an account? "
              : 'Already have an account? ',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
        GestureDetector(
          onTap: _toggleMode,
          child: Text(
            _isLoginMode ? 'Sign Up' : 'Log In',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  fontWeight: FontWeight.w600,
                ),
          ),
        ),
      ],
    );
  }
}
