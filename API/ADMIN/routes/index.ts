import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { authenticate, AuthenticatedRequest, requireRole } from '@core/middleware/rbac';
import { UserModel } from '@api/USERS/model';
import { HTTP_STATUS } from '@core/constants';
import { MESSAGES } from '@core/constants/messages';
import { AppError } from '@core/middleware/errorHandler';
import { getRedisClient } from '@core/services/redis';
import { taxAnalysisQueue } from '@api/CHATBOT/workers/tax_analyzer';
import { z } from 'zod';
import {
  getPlatformSettings,
  updatePlatformSettings,
} from '@api/ADMIN/services/platform_settings';
import { fetchEngagementAnalytics } from '@api/ADMIN/services/engagementAnalytics';
import {
  assertCanManageTargetUser,
  buildAdminUserListFilter,
  buildAssignableRoles,
} from '@api/ADMIN/services/assertCanManageUser';
import {
  activateVendorLivestream,
  banUserFromLivestreams,
  banUserFromPlatform,
  listVendorsForAdmin,
  unbanUserFromLivestreams,
  unbanUserFromPlatform,
} from '@api/ADMIN/services/moderation';
import { bypassVendorIdentityVerification } from '@api/ADMIN/services/vendorIdentityBypass';
import { findUserById } from '@core/services/db/userLookup';
import { fetchPlatformAnalytics } from '@api/ADMIN/services/platformAnalytics';
import { publishUserRoleUpdated } from '@api/AUTH/services/publishUserSynced';

const RoleUpdateSchema = z.object({
  role: z.enum(['super_admin', 'admin', 'editor', 'member', 'viewer']),
});

const PlatformSettingsUpdateSchema = z.object({
  allowContentEditorSignup: z.boolean(),
  allowAdminSignup: z.boolean(),
  allowSuperAdminSignup: z.boolean(),
  livestreamProvider: z.enum(['agora', 'cloudflare']).optional(),
});

export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRole('admin'));

adminRouter.get('/users', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const skip = (page - 1) * limit;
    const listFilter = buildAdminUserListFilter(actor.role);

    const [users, total] = await Promise.all([
      UserModel.find(listFilter)
        .select(
          'name email role userType emailVerified createdAt platformBanned livestreamBanned vendorProfile.canGoLive',
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      UserModel.countDocuments(listFilter),
    ]);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Users list',
      data: {
        users: users.map((user) => ({
          ...user,
          isVerified: user.emailVerified,
        })),
        total,
        assignableRoles: buildAssignableRoles(actor.role),
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/users/:userId/role', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.userId ?? '');
    const { role } = RoleUpdateSchema.parse(req.body);
    const actor = (req as AuthenticatedRequest).user;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new AppError(HTTP_STATUS.BAD_REQUEST, 'Invalid user id');
    }

    if (!buildAssignableRoles(actor.role).includes(role)) {
      throw new AppError(HTTP_STATUS.FORBIDDEN, MESSAGES.AUTH.FORBIDDEN);
    }

    const target = await findUserById(userId);
    if (!target) throw new AppError(HTTP_STATUS.NOT_FOUND, MESSAGES.USER.NOT_FOUND);

    assertCanManageTargetUser(actor, target);

    const previousRole = target.role;
    target.role = role;
    await target.save();

    await publishUserRoleUpdated({
      userId: String(target._id),
      workspaceId: String(target.workspaceId),
      role,
      previousRole,
      updatedBy: actor.userId,
      email: target.email,
      name: target.name,
      ...(target.userType ? { userType: target.userType } : {}),
    });

    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Role updated', data: {} });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:userId/ban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    await banUserFromPlatform(actor.userId, actor.role, String(req.params.userId), req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User banned from platform.', data: {} });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:userId/unban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    await unbanUserFromPlatform(actor.userId, actor.role, String(req.params.userId));
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User unbanned from platform.', data: {} });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:userId/livestream-ban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    await banUserFromLivestreams(actor.userId, actor.role, String(req.params.userId), req.body);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User banned from livestreams.', data: {} });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/users/:userId/livestream-unban', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    await unbanUserFromLivestreams(actor.userId, actor.role, String(req.params.userId));
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'User unbanned from livestreams.', data: {} });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/vendors', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const result = await listVendorsForAdmin(actor.role, page, limit);
    res.status(HTTP_STATUS.OK).json({ success: true, message: 'Vendors list', data: result });
  } catch (err) {
    next(err);
  }
});

const ActivateVendorLivestreamSchema = z.object({
  vendorPhotoUrl: z.string().url(),
});

adminRouter.post('/vendors/:userId/activate-livestream', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    const { vendorPhotoUrl } = ActivateVendorLivestreamSchema.parse(req.body);
    const result = await activateVendorLivestream(
      actor.userId,
      actor.role,
      String(req.params.userId ?? ''),
      vendorPhotoUrl,
    );
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Vendor approved for livestreams.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/platform-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const settings = await getPlatformSettings();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Platform settings',
      data: {
        allowContentEditorSignup: settings.allowContentEditorSignup,
        allowAdminSignup: settings.allowAdminSignup,
        allowSuperAdminSignup: settings.allowSuperAdminSignup,
        livestreamProvider: settings.livestreamProvider ?? 'agora',
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.patch('/platform-settings', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    const body = PlatformSettingsUpdateSchema.parse(req.body);

    if (body.allowSuperAdminSignup && actor.role !== 'super_admin') {
      throw new AppError(HTTP_STATUS.FORBIDDEN, MESSAGES.AUTH.FORBIDDEN);
    }

    const settings = await updatePlatformSettings({
      allowContentEditorSignup: body.allowContentEditorSignup,
      allowAdminSignup: body.allowAdminSignup,
      allowSuperAdminSignup: actor.role === 'super_admin' ? body.allowSuperAdminSignup : undefined,
      livestreamProvider: body.livestreamProvider,
      updatedBy: actor.userId,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Platform settings updated',
      data: {
        allowContentEditorSignup: settings.allowContentEditorSignup,
        allowAdminSignup: settings.allowAdminSignup,
        allowSuperAdminSignup: settings.allowSuperAdminSignup,
        livestreamProvider: settings.livestreamProvider ?? 'agora',
        updatedAt: settings.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.post('/vendors/:userId/identity-bypass', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    if (actor.role !== 'super_admin') {
      throw new AppError(HTTP_STATUS.FORBIDDEN, MESSAGES.AUTH.FORBIDDEN);
    }

    const userId = String(req.params.userId ?? '');
    const result = await bypassVendorIdentityVerification(userId, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Vendor identity verification bypassed.',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/engagement/analytics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const analytics = await fetchEngagementAnalytics();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Engagement analytics',
      data: analytics,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/platform-analytics', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const actor = (req as AuthenticatedRequest).user;
    const analytics = await fetchPlatformAnalytics(actor.role);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Platform analytics',
      data: analytics,
    });
  } catch (err) {
    next(err);
  }
});

adminRouter.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const mongoState = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    let redis: 'connected' | 'disconnected' = 'disconnected';
    try {
      await getRedisClient().ping();
      redis = 'connected';
    } catch {
      redis = 'disconnected';
    }

    let queueActive = 0;
    let queueWaiting = 0;
    try {
      const counts = await taxAnalysisQueue.getJobCounts();
      queueActive = counts.active;
      queueWaiting = counts.waiting;
    } catch {
      // queue unavailable
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'System health',
      data: {
        mongodb: mongoState,
        redis,
        queueActive,
        queueWaiting,
      },
    });
  } catch (err) {
    next(err);
  }
});
