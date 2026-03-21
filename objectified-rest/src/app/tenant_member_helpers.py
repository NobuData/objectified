"""Tenant member workspace roles and pending email invitations (GH-193)."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import HTTPException

from app.database import db
from app.schemas.tenant_account import TenantMemberRoleSchema

logger = logging.getLogger(__name__)


def validate_member_role_in_tenant(tenant_id: str, role_id: str) -> None:
    rows = db.execute_query(
        """
        SELECT 1
        FROM objectified.role
        WHERE id = %s AND tenant_id = %s AND deleted_at IS NULL
        LIMIT 1
        """,
        (role_id, tenant_id),
    )
    if not rows:
        raise HTTPException(
            status_code=422,
            detail="member_role_id is not a valid role for this tenant.",
        )


def assign_workspace_role(tenant_id: str, account_id: str, role_id: str) -> None:
    db.execute_mutation(
        """
        INSERT INTO objectified.account_role
            (tenant_id, account_id, role_id, resource_type, resource_id, enabled, metadata)
        VALUES (%s, %s, %s, NULL, NULL, true, '{}'::jsonb)
        """,
        (tenant_id, account_id, role_id),
        returning=False,
    )


def replace_workspace_roles(
    tenant_id: str, account_id: str, role_id: Optional[str]
) -> None:
    db.execute_mutation(
        """
        UPDATE objectified.account_role
        SET deleted_at = timezone('utc', clock_timestamp()), enabled = false
        WHERE tenant_id = %s
          AND account_id = %s
          AND resource_type IS NULL
          AND resource_id IS NULL
          AND deleted_at IS NULL
        """,
        (tenant_id, account_id),
        returning=False,
    )
    if role_id:
        assign_workspace_role(tenant_id, account_id, role_id)


def fetch_workspace_roles_for_members(
    tenant_id: str, account_ids: List[str]
) -> dict[str, List[TenantMemberRoleSchema]]:
    if not account_ids:
        return {}
    rows = db.execute_query(
        """
        SELECT ar.account_id, r.id AS role_id, r.key, r.name
        FROM objectified.account_role ar
        INNER JOIN objectified.role r
            ON r.id = ar.role_id AND r.deleted_at IS NULL
        WHERE ar.tenant_id = %s
          AND ar.account_id = ANY(%s)
          AND ar.deleted_at IS NULL
          AND ar.enabled = true
          AND ar.resource_type IS NULL
          AND ar.resource_id IS NULL
        ORDER BY ar.account_id, LOWER(r.key)
        """,
        (tenant_id, account_ids),
    )
    out: dict[str, List[TenantMemberRoleSchema]] = {}
    for r in rows:
        aid = str(r["account_id"])
        out.setdefault(aid, []).append(
            TenantMemberRoleSchema(
                role_id=str(r["role_id"]),
                key=str(r["key"]),
                name=str(r["name"]),
            )
        )
    return out


def fulfill_pending_member_invitations(account_id: str, email: str) -> None:
    """Attach new accounts to tenants for any pending invitations matching ``email``."""
    rows = db.execute_query(
        """
        SELECT id, tenant_id, role_id
        FROM objectified.tenant_member_invitation
        WHERE LOWER(email) = LOWER(%s)
          AND status = 'pending'
          AND deleted_at IS NULL
        """,
        (email,),
    )
    if not rows:
        return

    for inv in rows:
        inv_id = str(inv["id"])
        tid = str(inv["tenant_id"])
        role_id = inv.get("role_id")
        role_id_str = str(role_id) if role_id is not None else None

        already = db.execute_query(
            """
            SELECT 1
            FROM objectified.tenant_account
            WHERE tenant_id = %s AND account_id = %s AND deleted_at IS NULL
            LIMIT 1
            """,
            (tid, account_id),
        )
        if already:
            db.execute_mutation(
                """
                UPDATE objectified.tenant_member_invitation
                SET status = 'cancelled',
                    deleted_at = timezone('utc', clock_timestamp())
                WHERE id = %s AND status = 'pending' AND deleted_at IS NULL
                """,
                (inv_id,),
                returning=False,
            )
            continue

        mem = db.execute_mutation(
            """
            INSERT INTO objectified.tenant_account (tenant_id, account_id, access_level, enabled)
            VALUES (%s, %s, 'member', true)
            RETURNING id
            """,
            (tid, account_id),
        )
        if not mem:
            logger.warning(
                "fulfill_pending_member_invitations: failed to insert tenant_account "
                "tenant=%s account=%s invitation=%s",
                tid,
                account_id,
                inv_id,
            )
            continue

        if role_id_str:
            try:
                validate_member_role_in_tenant(tid, role_id_str)
                assign_workspace_role(tid, account_id, role_id_str)
            except HTTPException:
                logger.warning(
                    "fulfill_pending_member_invitations: invalid role on invitation %s",
                    inv_id,
                )

        db.execute_mutation(
            """
            UPDATE objectified.tenant_member_invitation
            SET status = 'accepted', updated_at = timezone('utc', clock_timestamp())
            WHERE id = %s AND status = 'pending' AND deleted_at IS NULL
            """,
            (inv_id,),
            returning=False,
        )
