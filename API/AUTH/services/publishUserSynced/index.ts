import { KAFKA_TOPICS } from '@core/constants/kafka';
import { publishKafkaEvent } from '@core/services/kafka';
import type { UserRole } from '@api/AUTH/models/user';

export type UserAuthProjection = {
  userId: string;
  workspaceId: string;
  role: UserRole | string;
  email?: string;
  name?: string;
  userType?: string;
  platformBanned?: boolean;
  avatarUrl?: string;
  profileImage?: string;
};

export async function publishUserSynced(
  user: UserAuthProjection,
  reason: 'login' | 'refresh' | 'register' | 'role_updated' | 'onboarding',
): Promise<void> {
  await publishKafkaEvent(
    KAFKA_TOPICS.USER_SYNCED,
    {
      userId: user.userId,
      workspaceId: user.workspaceId,
      role: user.role,
      ...(user.email ? { email: user.email } : {}),
      ...(user.name ? { name: user.name } : {}),
      ...(user.userType ? { userType: user.userType } : {}),
      ...(typeof user.platformBanned === 'boolean'
        ? { platformBanned: user.platformBanned }
        : {}),
      ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
      ...(user.profileImage ? { profileImage: user.profileImage } : {}),
      reason,
    },
    user.userId,
  );
}

export async function publishUserRoleUpdated(input: {
  userId: string;
  workspaceId: string;
  role: UserRole | string;
  previousRole: UserRole | string;
  updatedBy: string;
  email?: string;
  name?: string;
  userType?: string;
}): Promise<void> {
  await publishKafkaEvent(
    KAFKA_TOPICS.USER_ROLE_UPDATED,
    {
      userId: input.userId,
      workspaceId: input.workspaceId,
      role: input.role,
      previousRole: input.previousRole,
      updatedBy: input.updatedBy,
      ...(input.email ? { email: input.email } : {}),
      ...(input.name ? { name: input.name } : {}),
      ...(input.userType ? { userType: input.userType } : {}),
    },
    input.userId,
  );

  await publishUserSynced(
    {
      userId: input.userId,
      workspaceId: input.workspaceId,
      role: input.role,
      email: input.email,
      name: input.name,
      userType: input.userType,
    },
    'role_updated',
  );
}
