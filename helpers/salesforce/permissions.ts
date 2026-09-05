/**
 * Permission-model queries: permission set assignments, object permissions, field permissions.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * WHY ASSERT GRANTS AND NOT JUST EFFECTS
 *
 * `ui-api/object-info` tells you the EFFECT ("this persona can't edit AnnualRevenue"). It doesn't
 * tell you the CAUSE. When an effect test fails you still have to work out whether a permission set
 * was unassigned, a profile changed, or a muting rule kicked in.
 *
 * Asserting the grant directly turns "six FLS tests went red for no obvious reason" into
 * "Restricted_Field_Visibility is no longer assigned to limitedFields". Permission drift IS
 * contract drift, and it happens with no deploy and no notification.
 *
 * ⚠️ These queries need admin visibility — pass the `adminOrg` client, not `org`. That's also a
 * useful reinforcement of the identity split: reading the permission model is an arrange-time
 * concern, asserting its effects is a subject-time concern.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

import { z } from 'zod';
import type { ApiRequest } from '../../fixtures/api/api-request';
import { SObjectAttributesSchema } from '../../fixtures/salesforce/schemas/salesforce-common.schema';
import { escapeSoql, soqlQuery } from './soql';

const PermissionSetAssignmentRowSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  PermissionSet: z.strictObject({
    attributes: SObjectAttributesSchema,
    Name: z.string(),
    Label: z.string(),
    IsOwnedByProfile: z.boolean(),
  }),
  PermissionSetGroupId: z.string().nullable(),
});

const UserRowSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  Id: z.string(),
  Username: z.string(),
  Profile: z.strictObject({ attributes: SObjectAttributesSchema, Name: z.string() }).nullable(),
  UserRole: z.strictObject({ attributes: SObjectAttributesSchema, Name: z.string() }).nullable(),
  IsActive: z.boolean(),
});

export interface UserIdentity {
  readonly id: string;
  readonly username: string;
  readonly profileName: string | null;
  readonly roleName: string | null;
  readonly isActive: boolean;
}

/**
 * Resolve a user's Id, Profile, and Role by username.
 *
 * Also asserts nothing — callers decide. But note `IsActive`: an INACTIVE test user produces auth
 * failures that look like Connected App misconfiguration and waste an afternoon.
 */
export async function findUserByUsername(
  adminOrg: ApiRequest,
  username: string,
): Promise<UserIdentity | undefined> {
  const statement =
    `SELECT Id, Username, Profile.Name, UserRole.Name, IsActive FROM User ` +
    `WHERE Username = '${escapeSoql(username)}'`;
  const rows = await soqlQuery(adminOrg, statement, UserRowSchema);
  const row = rows[0];
  if (row === undefined) return undefined;
  return {
    id: row.Id,
    username: row.Username,
    profileName: row.Profile?.Name ?? null,
    roleName: row.UserRole?.Name ?? null,
    isActive: row.IsActive,
  };
}

/**
 * Like `findUserByUsername` but throws when the user is missing or inactive.
 *
 * Exists so specs get a `UserIdentity` rather than `UserIdentity | undefined` and don't need a
 * conditional in the test body. The inactive check is here because an INACTIVE test user produces
 * auth failures that look like Connected App misconfiguration and waste an afternoon.
 */
export async function requireUserByUsername(
  adminOrg: ApiRequest,
  username: string,
): Promise<UserIdentity> {
  const user = await findUserByUsername(adminOrg, username);
  if (user === undefined) {
    throw new Error(
      `No org user found with username "${username}". Check the SF_USERNAME_* env var for this ` +
        'persona, and remember a sandbox refresh appends a suffix (SF_USERNAME_SUFFIX).',
    );
  }
  if (!user.isActive) {
    throw new Error(
      `Org user "${username}" is INACTIVE. Auth will fail in a way that looks like Connected App ` +
        'misconfiguration — activate the user or point the persona at a different one.',
    );
  }
  return user;
}

/**
 * Permission set names assigned to a user.
 *
 * ⚠️ THE GOTCHA: every Profile has a hidden, profile-owned PermissionSet, and it shows up in
 * `PermissionSetAssignment`. Without the `IsOwnedByProfile = false` filter your "assigned sets"
 * list always contains one phantom entry named after the profile, and an `exact` comparison can
 * never pass. Filtering it out is why this helper exists rather than a raw query at the call site.
 */
export async function assignedPermissionSets(
  adminOrg: ApiRequest,
  userId: string,
): Promise<string[]> {
  const statement =
    `SELECT PermissionSet.Name, PermissionSet.Label, PermissionSet.IsOwnedByProfile, ` +
    `PermissionSetGroupId FROM PermissionSetAssignment ` +
    `WHERE AssigneeId = '${escapeSoql(userId)}'`;
  const rows = await soqlQuery(adminOrg, statement, PermissionSetAssignmentRowSchema);
  return rows
    .filter((row) => !row.PermissionSet.IsOwnedByProfile)
    .map((row) => row.PermissionSet.Name)
    .sort();
}

/**
 * Permission sets assigned via a Permission Set GROUP rather than directly.
 *
 * Worth separating: a set granted through a group can be neutralised by MUTING on that group, so
 * "assigned" does not imply "effective". If a grant assertion passes while the effect assertion
 * fails, muting is the first thing to check.
 */
export async function permissionSetsFromGroups(
  adminOrg: ApiRequest,
  userId: string,
): Promise<string[]> {
  const statement =
    `SELECT PermissionSet.Name, PermissionSet.Label, PermissionSet.IsOwnedByProfile, ` +
    `PermissionSetGroupId FROM PermissionSetAssignment ` +
    `WHERE AssigneeId = '${escapeSoql(userId)}'`;
  const rows = await soqlQuery(adminOrg, statement, PermissionSetAssignmentRowSchema);
  return rows
    .filter((row) => row.PermissionSetGroupId !== null && !row.PermissionSet.IsOwnedByProfile)
    .map((row) => row.PermissionSet.Name)
    .sort();
}

const ObjectPermissionsRowSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  SobjectType: z.string(),
  PermissionsCreate: z.boolean(),
  PermissionsRead: z.boolean(),
  PermissionsEdit: z.boolean(),
  PermissionsDelete: z.boolean(),
  PermissionsViewAllRecords: z.boolean(),
  PermissionsModifyAllRecords: z.boolean(),
  Parent: z.strictObject({
    attributes: SObjectAttributesSchema,
    Name: z.string(),
    IsOwnedByProfile: z.boolean(),
  }),
});

export interface ObjectPermissionGrant {
  readonly source: string;
  readonly create: boolean;
  readonly read: boolean;
  readonly edit: boolean;
  readonly delete: boolean;
  readonly viewAll: boolean;
  readonly modifyAll: boolean;
}

/**
 * Where an object grant actually COMES from, per permission set.
 *
 * Use this to answer "why can this persona delete Accounts?" — the answer is a specific permission
 * set, and `viewAll`/`modifyAll` are the two flags that make a persona quietly bypass sharing.
 * A non-admin persona with `modifyAll` is almost always a misconfiguration worth failing on.
 */
export async function objectPermissionsFor(
  adminOrg: ApiRequest,
  objectApiName: string,
  permissionSetNames: readonly string[],
): Promise<ObjectPermissionGrant[]> {
  if (permissionSetNames.length === 0) return [];
  const nameList = permissionSetNames.map((name) => `'${escapeSoql(name)}'`).join(', ');
  const statement =
    `SELECT SobjectType, PermissionsCreate, PermissionsRead, PermissionsEdit, PermissionsDelete, ` +
    `PermissionsViewAllRecords, PermissionsModifyAllRecords, Parent.Name, Parent.IsOwnedByProfile ` +
    `FROM ObjectPermissions ` +
    `WHERE SobjectType = '${escapeSoql(objectApiName)}' AND Parent.Name IN (${nameList})`;
  const rows = await soqlQuery(adminOrg, statement, ObjectPermissionsRowSchema);
  return rows.map((row) => ({
    source: row.Parent.Name,
    create: row.PermissionsCreate,
    read: row.PermissionsRead,
    edit: row.PermissionsEdit,
    delete: row.PermissionsDelete,
    viewAll: row.PermissionsViewAllRecords,
    modifyAll: row.PermissionsModifyAllRecords,
  }));
}

const FieldPermissionsRowSchema = z.strictObject({
  attributes: SObjectAttributesSchema,
  Field: z.string(),
  SobjectType: z.string(),
  PermissionsRead: z.boolean(),
  PermissionsEdit: z.boolean(),
  Parent: z.strictObject({
    attributes: SObjectAttributesSchema,
    Name: z.string(),
    IsOwnedByProfile: z.boolean(),
  }),
});

export interface FieldPermissionGrant {
  readonly source: string;
  /** Fully qualified, e.g. `Account.AnnualRevenue`. */
  readonly field: string;
  readonly read: boolean;
  readonly edit: boolean;
}

/**
 * Field grants per permission set — the CAUSE behind an FLS effect.
 *
 * ⚠️ `FieldPermissions` only has rows for fields whose access has been EXPLICITLY set. A field with
 * no row is not necessarily hidden; it may be governed by the profile default. So this is a
 * diagnostic for "which set granted this", not a substitute for asserting the effect via
 * `ui-api/object-info`. Assert effects; use this to explain them.
 */
export async function fieldPermissionsFor(
  adminOrg: ApiRequest,
  objectApiName: string,
  permissionSetNames: readonly string[],
): Promise<FieldPermissionGrant[]> {
  if (permissionSetNames.length === 0) return [];
  const nameList = permissionSetNames.map((name) => `'${escapeSoql(name)}'`).join(', ');
  const statement =
    `SELECT Field, SobjectType, PermissionsRead, PermissionsEdit, Parent.Name, ` +
    `Parent.IsOwnedByProfile FROM FieldPermissions ` +
    `WHERE SobjectType = '${escapeSoql(objectApiName)}' AND Parent.Name IN (${nameList})`;
  const rows = await soqlQuery(adminOrg, statement, FieldPermissionsRowSchema);
  return rows.map((row) => ({
    source: row.Parent.Name,
    field: row.Field,
    read: row.PermissionsRead,
    edit: row.PermissionsEdit,
  }));
}
