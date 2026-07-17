import mongoose from 'mongoose';
import { UserModel, AccountModel } from '@api/AUTH/models';
import { ONBOARDING_USER_TYPES } from '@core/constants/onboarding';
import type { OnboardingState } from '@api/USERS/interfaces/onboarding';
import { attachPrivyWalletToUser } from '@api/AUTH/services/privy/attachWallet';
import { initializeFreemiumWallet } from '@api/WALLETS/services/initialize.freemium';
import { publishKafkaEvent } from '@core/services/kafka';
import { KAFKA_TOPICS } from '@core/constants/kafka';
import { publishUserSynced } from '@api/AUTH/services/publishUserSynced';
import { buildVendorProfileFromDraft } from '../validateStep';
import {
  findUserByEmail,
  findUserById,
  purgeIncompleteUsersByEmail,
} from '@core/services/db/userLookup';

const purgeOrphanCredentialAccounts = async (email: string): Promise<void> => {
  const normalizedEmail = email.trim().toLowerCase();
  const accounts = await AccountModel.find({
    providerId: 'credential',
    accountId: normalizedEmail,
  }).select('_id userId').lean();

  await Promise.all(
    accounts.map(async (account) => {
      const owner = await findUserById(String(account.userId), { select: '_id' });
      if (!owner) {
        await AccountModel.deleteOne({ _id: account._id });
      }
    }),
  );
};

export const persistOnboardingUser = async (
  state: OnboardingState,
): Promise<{ userId: string; workspaceId: string }> => {
  const { account, draft } = state;
  const normalizedEmail = account.email.trim().toLowerCase();

  const existingUser = await findUserByEmail(normalizedEmail, { onboardingComplete: true });
  if (existingUser) {
    return {
      userId: String(existingUser._id),
      workspaceId: String(existingUser.workspaceId),
    };
  }

  await purgeOrphanCredentialAccounts(normalizedEmail);
  await purgeIncompleteUsersByEmail(normalizedEmail);

  const workspaceId = new mongoose.Types.ObjectId();
  const isPrivilegedAccount = account.workspaceRole === 'admin' || account.workspaceRole === 'super_admin';
  const userType = isPrivilegedAccount ? ONBOARDING_USER_TYPES.EDITOR : draft.userType;

  const userPayload: Record<string, unknown> = {
    name: account.name,
    email: normalizedEmail,
    workspaceId,
    role: account.workspaceRole,
    emailVerified: true,
    onboardingComplete: true,
    userType,
    ...(account.passwordHash ? { passwordHash: account.passwordHash } : {}),
    ...(account.oauthProvider ? { oauthProvider: account.oauthProvider } : {}),
    ...(account.oauthProviderId ? { oauthProviderId: account.oauthProviderId } : {}),
    ...(account.privyUserId ? { privyUserId: account.privyUserId } : {}),
    ...(account.profileImage ? { profileImage: account.profileImage } : {}),
    ...(account.avatarUrl ? { avatarUrl: account.avatarUrl } : {}),
    ...(account.solanaUsdcWalletAddress ? { solanaUsdcWalletAddress: account.solanaUsdcWalletAddress } : {}),
    ...(draft.phoneNumber ? { phoneNumber: draft.phoneNumber } : {}),
    ...(draft.username ? { username: draft.username } : {}),
  };

  if (userType === ONBOARDING_USER_TYPES.VENDOR) {
    userPayload.vendorProfile = buildVendorProfileFromDraft(draft);
  } else if (userType === ONBOARDING_USER_TYPES.BUYER) {
    userPayload.buyerProfile = {
      categories: draft.categories ?? [],
      subcategories: draft.subcategories ?? [],
    };
  } else if (userType === ONBOARDING_USER_TYPES.EDITOR && !isPrivilegedAccount) {
    userPayload.role = 'editor';
    if (draft.categories?.length) {
      userPayload.buyerProfile = {
        categories: draft.categories,
        subcategories: draft.subcategories ?? [],
      };
    }
  }

  const user = await UserModel.create(userPayload);

  if (account.authMethod === 'credential' && account.passwordHash) {
    await AccountModel.findOneAndUpdate(
      { providerId: 'credential', accountId: normalizedEmail },
      {
        userId: user._id,
        providerId: 'credential',
        accountId: normalizedEmail,
        password: account.passwordHash,
      },
      { upsert: true, new: true },
    );
  } else if (account.oauthProvider && account.oauthProviderId) {
    await AccountModel.findOneAndUpdate(
      { providerId: account.oauthProvider, accountId: account.oauthProviderId },
      {
        userId: user._id,
        providerId: account.oauthProvider,
        accountId: account.oauthProviderId,
      },
      { upsert: true, new: true },
    );
  }

  const userId = String(user._id);
  const workspaceIdStr = String(workspaceId);

  try {
    await initializeFreemiumWallet(workspaceIdStr, userId);
  } catch {
    // Non-blocking wallet bootstrap
  }

  if (!account.solanaUsdcWalletAddress) {
    await attachPrivyWalletToUser({
      userId,
      email: normalizedEmail,
      name: account.name,
    });
  }

  await publishKafkaEvent(
    KAFKA_TOPICS.USER_REGISTERED,
    {
      userId,
      workspaceId: workspaceIdStr,
      email: normalizedEmail,
      role: user.role,
      userType,
      signupRole: account.signupRole,
      authMethod: account.authMethod,
    },
    userId,
  );

  await publishUserSynced(
    {
      userId,
      workspaceId: workspaceIdStr,
      role: user.role,
      email: normalizedEmail,
      name: account.name,
      userType,
    },
    'register',
  );

  return { userId, workspaceId: workspaceIdStr };
};
