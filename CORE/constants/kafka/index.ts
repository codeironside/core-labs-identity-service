export const KAFKA_TOPICS = {
  USER_REGISTERED: 'identity.user.registered',
  USER_LOGIN: 'identity.user.login',
  USER_LOGOUT: 'identity.user.logout',
  USER_REFRESHED: 'identity.user.refreshed',
  USER_OAUTH_LINKED: 'identity.user.oauth.linked',
  USER_FORGOT_PASSWORD: 'identity.user.forgot.password',
  USER_RESET_PASSWORD: 'identity.user.reset.password',
  /** Full auth projection for downstream services (content-studio, etc.). */
  USER_SYNCED: 'identity.user.synced',
  /** Role change from admin panel. */
  USER_ROLE_UPDATED: 'identity.user.role.updated',
  WALLET_PROVISIONED: 'identity.wallet.provisioned',
  ONBOARDING_STARTED: 'identity.onboarding.started',
  ONBOARDING_STEP_SAVED: 'identity.onboarding.step.saved',
  ONBOARDING_COMPLETED: 'identity.onboarding.completed',
  ONBOARDING_EXPIRED: 'identity.onboarding.expired',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
