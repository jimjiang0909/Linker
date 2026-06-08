import 'package:flutter/services.dart';

/// Form validation utility class
///
/// Provides static validation methods for form fields.
/// All methods are pure functions — returns null if valid, error string if invalid.
abstract final class Validators {
  /// Invitation code regex: 8 alphanumeric characters
  static final _invitationCodeRegExp = RegExp(r'^[a-zA-Z0-9]{8}$');

  /// Email format regex
  static final _emailRegExp = RegExp(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
  );

  /// Invitation code input formatters: only allow letters and digits
  static final invitationCodeInputFormatters = <TextInputFormatter>[
    FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9]')),
    LengthLimitingTextInputFormatter(8),
  ];

  /// Validate invitation code
  static String? validateInvitationCode(String? value) {
    if (value == null || value.isEmpty) {
      return null; // Optional field
    }
    if (value.length != 8) {
      return 'Invite code must be 8 characters';
    }
    if (!_invitationCodeRegExp.hasMatch(value)) {
      return 'Only letters and numbers allowed';
    }
    return null;
  }

  /// Validate email
  static String? validateEmail(String? value) {
    if (value == null || value.isEmpty) {
      return 'Email is required';
    }
    if (!_emailRegExp.hasMatch(value)) {
      return 'Invalid email format';
    }
    return null;
  }

  /// Validate verification code
  static String? validateVerificationCode(String? value) {
    if (value == null || value.isEmpty) {
      return 'Verification code is required';
    }
    return null;
  }

  /// Validate name
  static String? validateName(String? value) {
    if (value == null || value.isEmpty) {
      return 'Name is required';
    }
    if (value.length > 20) {
      return 'Name must be 1-20 characters';
    }
    return null;
  }

  /// Validate birth year
  static String? validateBirthYear(int? value) {
    if (value == null) {
      return 'Birth year is required';
    }
    final currentYear = DateTime.now().year;
    final age = currentYear - value;
    if (age < 18 || age > 60) {
      return 'Age must be between 18 and 60';
    }
    return null;
  }

  /// Validate occupation
  static String? validateOccupation(String? value) {
    if (value == null || value.isEmpty) {
      return 'Occupation is required';
    }
    if (value.length > 30) {
      return 'Occupation must be 1-30 characters';
    }
    return null;
  }

  /// Validate city
  static String? validateCity(String? value) {
    if (value == null || value.isEmpty) {
      return 'City is required';
    }
    if (value.length > 30) {
      return 'City must be 1-30 characters';
    }
    return null;
  }

  /// Validate bio (optional field)
  static String? validateBio(String? value) {
    if (value == null || value.isEmpty) {
      return null;
    }
    if (value.length > 500) {
      return 'Bio must be under 500 characters';
    }
    return null;
  }
}
