/// App string constants (error message mappings, UI copy)
abstract final class AppStrings {
  // ============ General ============

  static const String appName = 'Linker';
  static const String confirm = 'Confirm';
  static const String cancel = 'Cancel';
  static const String save = 'Save';
  static const String retry = 'Retry';
  static const String loading = 'Loading...';
  static const String copySuccess = 'Copied to clipboard';

  // ============ Network Errors ============

  static const String networkUnavailable = 'No internet connection';
  static const String requestTimeout = 'Request timed out. Please check your connection.';
  static const String serverError = 'Service temporarily unavailable. Please try again later.';
  static const String unknownError = 'Something went wrong. Please try again.';
  static const String connectionRestoring = 'Reconnecting...';

  // ============ Auth ============

  static const String sendCode = 'Send Code';
  static const String register = 'Sign Up';
  static const String logout = 'Log Out';
  static const String logoutConfirm = 'Are you sure you want to log out?';
  static const String invitationCodeHint = 'Invite code (optional)';
  static const String emailHint = 'Enter your email';
  static const String verificationCodeHint = 'Enter verification code';

  // ============ Profile ============

  static const String profileSetup = 'Set Up Profile';
  static const String profileEdit = 'Edit Profile';
  static const String nameHint = 'Name (1-20 characters)';
  static const String occupationHint = 'Occupation (1-30 characters)';
  static const String cityHint = 'City';
  static const String bioHint = 'Tell us about yourself (max 500 characters)';
  static const String photoUpload = 'Add Photo';
  static const String photoLimitReached = 'Maximum 6 photos allowed';

  // ============ Preferences ============

  static const String preferencesSetup = 'Set Preferences';
  static const String preferencesEdit = 'Edit Preferences';
  static const String ageRange = 'Age Range';
  static const String datingIntent = 'Looking For';
  static const String occupationTypes = 'Preferred Occupations';
  static const String personalityTraits = 'Preferred Traits';
  static const String selectionLimitReached = 'Maximum 5 selections reached';

  // ============ Matches ============

  static const String dailyRecommendation = 'Discover';
  static const String noRecommendation = 'No recommendations today. Try adjusting your preferences.';
  static const String allRecommendationViewed = "You've seen all today's picks";
  static const String nextRecommendationHint = 'New recommendations coming tomorrow!';
  static const String dailyLimitReached = "You've reached today's limit";
  static const String interested = 'Like';
  static const String skip = 'Pass';
  static const String matchSuccess = "It's a Match!";
  static const String startChat = 'Start Chatting';

  // ============ Conversations ============

  static const String conversations = 'Messages';
  static const String noConversations = 'No conversations yet. Check out your daily picks!';
  static const String conversationEnded = 'Conversation ended';
  static const String endConversation = 'End Conversation';
  static const String endConversationConfirm = 'Are you sure you want to end this conversation? You won\'t be able to message each other anymore.';
  static const String report = 'Report';
  static const String reportReason = 'Select a reason';
  static const String messagePlaceholder = 'Type a message...';
  static const String sendFailed = 'Failed to send. Tap to retry.';

  // ============ Profile / Me ============

  static const String myProfile = 'Me';
  static const String editProfile = 'Edit Profile';
  static const String preferencesSettings = 'Preferences';
  static const String myInvitationCodes = 'My Invite Codes';
  static const String invitedUsers = 'Invited Friends';

  // ============ Invitation Status ============

  static const String invitationAvailable = 'Available';
  static const String invitationUsed = 'Used';
  static const String invitationExpired = 'Expired';

  // ============ Bottom Navigation ============

  static const String navRecommendation = 'Discover';
  static const String navMessages = 'Messages';
  static const String navMe = 'Me';

  // ============ API Error Code Mapping ============

  static const Map<String, String> errorMessages = {
    // Auth
    'INVALID_EMAIL_FORMAT': 'Invalid email format',
    'VERIFICATION_CODE_EXPIRED': 'Code expired. Please request a new one.',
    'VERIFICATION_CODE_MISMATCH': 'Incorrect verification code',
    'EMAIL_ALREADY_REGISTERED': 'This email is already registered',
    'MISSING_CODE': 'Verification code is required',
    'MISSING_INVITATION_CODE': 'Invite code is required',
    'INVALID_CODE': 'Invalid or expired verification code',
    'CODE_EXPIRED': 'Code expired. Please request a new one.',
    'ACCOUNT_LOCKED': 'Account locked. Please try again later.',
    'EMAIL_SEND_FAILED': 'Failed to send code. Please try again.',

    // Invitation
    'INVALID_INVITATION_CODE': 'Invalid invite code',
    'INVITATION_CODE_USED': 'This invite code has already been used',
    'INVITATION_CODE_EXPIRED': 'This invite code has expired',
    'INVITATION_INVALID': 'Invalid invite code',
    'INVITATION_USED': 'This invite code has already been used',
    'INVITATION_EXPIRED': 'This invite code has expired',
    'CODE_GENERATION_FAILED': 'Failed to generate code. Please try again.',

    // Rate Limiting
    'RATE_LIMIT_EXCEEDED': 'Too many requests. Please wait a moment.',
    'DAILY_LIMIT_REACHED': "You've reached today's limit",

    // Profile
    'PROFILE_NOT_FOUND': 'Profile not found',
    'USER_NOT_READY': 'Please complete your profile and preferences first',
    'VALIDATION_ERROR': 'Validation failed. Please check your input.',

    // Photos
    'PHOTO_FORMAT_INVALID': 'Unsupported format. Please use JPEG or PNG.',
    'PHOTO_SIZE_EXCEEDED': 'Photo exceeds 5MB size limit',
    'PHOTO_RESOLUTION_LOW': 'Photo resolution too low (min 300×300)',
    'INVALID_PHOTO': 'Please upload a valid photo file',
    'PHOTO_TOO_LARGE': 'Photo exceeds 5MB size limit',
    'UNSUPPORTED_FORMAT': 'Unsupported format. Only JPEG and PNG allowed.',
    'INVALID_IMAGE': 'Unable to read photo. File may be corrupted.',
    'RESOLUTION_TOO_LOW': 'Photo resolution too low (min 300×300)',
    'PHOTO_LIMIT_REACHED': 'Maximum 6 photos reached',
    'PHOTO_NOT_FOUND': 'Photo not found',

    // Conversations
    'CONVERSATION_ENDED': 'This conversation has ended',
    'CONVERSATION_NOT_FOUND': 'Conversation not found',
    'CONVERSATION_ALREADY_ENDED': 'This conversation has already ended',
    'EMPTY_MESSAGE': 'Message cannot be empty',
    'MESSAGE_TOO_LONG': 'Message exceeds 1000 character limit',
    'MESSAGE_NOT_FOUND': 'Message not found',

    // Matches
    'MATCH_NOT_FOUND': 'Match not found',
    'MATCH_NOT_PENDING': 'This match is no longer pending',
    'MATCH_EXPIRED': 'This match has expired',
    'ALREADY_RESPONDED': "You've already responded to this match",

    // Permissions
    'NOT_PARTICIPANT': "You don't have permission to do this",
    'FORBIDDEN': "You don't have permission to do this",
    'NOT_FOUND': 'Resource not found',

    // Server
    'INTERNAL_ERROR': 'Service temporarily unavailable. Please try again later.',
    'SERVER_ERROR': 'Service temporarily unavailable. Please try again later.',
    'AI_CONFIG_ERROR': 'Service configuration error. Please try again later.',
    'AI_EMPTY_RESPONSE': 'Service response error. Please try again later.',

    // Client Network
    'TIMEOUT': 'Request timed out. Please check your connection.',
    'NETWORK_ERROR': 'No internet connection',
    'CANCELLED': 'Request cancelled',
    'UNKNOWN': 'Something went wrong. Please try again.',
  };

  /// Get user-friendly error message by error code
  static String getErrorMessage(String? code) {
    if (code == null) return unknownError;
    return errorMessages[code] ?? unknownError;
  }
}
