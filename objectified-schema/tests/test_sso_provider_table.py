"""
test_sso_provider_table.py – SQL tests for the objectified.sso_provider table.

All tests run inside a transaction rolled back after completion (see conftest.py).
"""

import json
import uuid

import psycopg2
import pytest


def _insert_tenant(conn, slug="sso-tenant"):
    conn.execute(
        """
        INSERT INTO objectified.tenant (name, description, slug)
        VALUES (%s, %s, %s)
        ON CONFLICT (slug) DO NOTHING
        """,
        ("SSO Tenant", "Tenant for SSO tests", slug),
    )
    return conn.fetchone("SELECT id FROM objectified.tenant WHERE slug = %s", (slug,))["id"]


class TestSsoProviderTableStructure:
    def test_table_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'objectified'
              AND table_name   = 'sso_provider'
            """
        )
        assert row is not None, "Table objectified.sso_provider does not exist"

    @pytest.mark.parametrize(
        ("column_name", "data_type", "nullable"),
        [
            ("id", "uuid", "NO"),
            ("tenant_id", "uuid", "NO"),
            ("provider_type", "character varying", "NO"),
            ("name", "character varying", "NO"),
            ("enabled", "boolean", "NO"),
            ("oidc_discovery", "jsonb", "YES"),
            ("saml_metadata_xml", "text", "YES"),
            ("metadata", "jsonb", "NO"),
            ("created_at", "timestamp without time zone", "NO"),
            ("updated_at", "timestamp without time zone", "YES"),
            ("deleted_at", "timestamp without time zone", "YES"),
        ],
    )
    def test_column_exists_with_expected_shape(self, conn, column_name, data_type, nullable):
        row = conn.fetchone(
            """
            SELECT data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'objectified'
              AND table_name   = 'sso_provider'
              AND column_name  = %s
            """,
            (column_name,),
        )
        assert row is not None, f"Column '{column_name}' is missing"
        assert row["data_type"] == data_type
        assert row["is_nullable"] == nullable


class TestSsoProviderTableConstraints:
    def test_updated_at_trigger_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT trigger_name
            FROM information_schema.triggers
            WHERE event_object_schema = 'objectified'
              AND event_object_table  = 'sso_provider'
              AND trigger_name        = 'trg_sso_provider_updated_at'
            """
        )
        assert row is not None, "Trigger trg_sso_provider_updated_at is missing"

    def test_type_check_constraint_exists(self, conn):
        row = conn.fetchone(
            """
            SELECT conname
            FROM pg_constraint
            WHERE conrelid = 'objectified.sso_provider'::regclass
              AND contype = 'c'
              AND conname = 'chk_sso_provider_type_fields'
            """
        )
        assert row is not None, "Constraint chk_sso_provider_type_fields is missing"


class TestSsoProviderTableDataIntegrity:
    def test_insert_oidc_provider_minimal(self, conn):
        tenant_id = _insert_tenant(conn, "sso-oidc-tenant")
        discovery = {"issuer": "https://idp.example.com", "authorization_endpoint": "https://idp.example.com/auth"}
        conn.execute(
            """
            INSERT INTO objectified.sso_provider
                (tenant_id, provider_type, name, oidc_discovery)
            VALUES (%s, 'oidc', %s, %s::jsonb)
            """,
            (tenant_id, "Okta", json.dumps(discovery)),
        )
        row = conn.fetchone(
            """
            SELECT provider_type, name, enabled, oidc_discovery, saml_metadata_xml, metadata, deleted_at
            FROM objectified.sso_provider
            WHERE tenant_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL
            """,
            (tenant_id, "okta"),
        )
        assert row is not None
        assert row["provider_type"] == "oidc"
        assert row["enabled"] is True
        assert row["oidc_discovery"] == discovery
        assert row["saml_metadata_xml"] is None
        assert row["metadata"] == {}
        assert row["deleted_at"] is None

    def test_insert_saml_provider_minimal(self, conn):
        tenant_id = _insert_tenant(conn, "sso-saml-tenant")
        xml = "<EntityDescriptor entityID='urn:test'></EntityDescriptor>"
        conn.execute(
            """
            INSERT INTO objectified.sso_provider
                (tenant_id, provider_type, name, saml_metadata_xml)
            VALUES (%s, 'saml', %s, %s)
            """,
            (tenant_id, "AzureAD", xml),
        )
        row = conn.fetchone(
            """
            SELECT provider_type, oidc_discovery, saml_metadata_xml
            FROM objectified.sso_provider
            WHERE tenant_id = %s AND LOWER(name) = LOWER(%s) AND deleted_at IS NULL
            """,
            (tenant_id, "azuread"),
        )
        assert row["provider_type"] == "saml"
        assert row["oidc_discovery"] is None
        assert row["saml_metadata_xml"] == xml

    def test_invalid_type_fields_rejected(self, conn):
        tenant_id = _insert_tenant(conn, "sso-bad-tenant")
        conn.execute("SAVEPOINT before_bad_insert")
        with pytest.raises(psycopg2.errors.CheckViolation):
            conn.execute(
                """
                INSERT INTO objectified.sso_provider
                    (tenant_id, provider_type, name)
                VALUES (%s, 'oidc', %s)
                """,
                (tenant_id, "BadOIDC"),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_insert")
        conn.execute("RELEASE SAVEPOINT before_bad_insert")

    def test_unique_name_per_tenant_and_type_case_insensitive(self, conn):
        tenant_id = _insert_tenant(conn, "sso-uniq-tenant")
        discovery = {"issuer": "https://idp.example.com"}
        conn.execute(
            """
            INSERT INTO objectified.sso_provider
                (tenant_id, provider_type, name, oidc_discovery)
            VALUES (%s, 'oidc', %s, %s::jsonb)
            """,
            (tenant_id, "Okta", json.dumps(discovery)),
        )
        conn.execute("SAVEPOINT before_dup")
        with pytest.raises(psycopg2.errors.UniqueViolation):
            conn.execute(
                """
                INSERT INTO objectified.sso_provider
                    (tenant_id, provider_type, name, oidc_discovery)
                VALUES (%s, 'oidc', %s, %s::jsonb)
                """,
                (tenant_id, "okta", json.dumps(discovery)),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_dup")
        conn.execute("RELEASE SAVEPOINT before_dup")

    def test_invalid_foreign_key_rejected(self, conn):
        bogus_tenant_id = str(uuid.uuid4())
        discovery = {"issuer": "https://idp.example.com"}
        conn.execute("SAVEPOINT before_bad_fk")
        with pytest.raises(psycopg2.errors.ForeignKeyViolation):
            conn.execute(
                """
                INSERT INTO objectified.sso_provider
                    (tenant_id, provider_type, name, oidc_discovery)
                VALUES (%s, 'oidc', %s, %s::jsonb)
                """,
                (bogus_tenant_id, "Okta", json.dumps(discovery)),
            )
        conn.execute("ROLLBACK TO SAVEPOINT before_bad_fk")
        conn.execute("RELEASE SAVEPOINT before_bad_fk")

