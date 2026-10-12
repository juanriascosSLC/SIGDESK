#!/bin/sh
set -eu

create_role_and_database() {
  role="$1"
  database="$2"
  password="$3"

  psql --username "$POSTGRES_USER" --dbname postgres \
    --set=ON_ERROR_STOP=1 --set=role_name="$role" --set=db_name="$database" --set=role_password="$password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role_name', :'role_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role_name') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'role_name')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db_name') \gexec
SQL
}

create_role_and_database organization_service sigdesk_organization_beta "$ORGANIZATION_DB_PASSWORD"
create_role_and_database resource_service sigdesk_resource_beta "$RESOURCE_DB_PASSWORD"
create_role_and_database tickets_service sigdesk_tickets_beta "$TICKETS_DB_PASSWORD"
create_role_and_database change_service sigdesk_change_beta "$CHANGE_DB_PASSWORD"
create_role_and_database problem_service sigdesk_problem_beta "$PROBLEM_DB_PASSWORD"
create_role_and_database workflow_service sigdesk_workflow_beta "$WORKFLOW_DB_PASSWORD"
create_role_and_database notification_service sigdesk_notification_beta "$NOTIFICATION_DB_PASSWORD"
create_role_and_database audit_service sigdesk_audit_beta "$AUDIT_DB_PASSWORD"
create_role_and_database knowledge_service sigdesk_knowledge_beta "$KNOWLEDGE_DB_PASSWORD"
create_role_and_database rag_service sigdesk_rag_beta "$RAG_DB_PASSWORD"
create_role_and_database ai_advisor_service sigdesk_ai_advisor_beta "$AI_ADVISOR_DB_PASSWORD"
create_role_and_database temporal_service sigdesk_temporal_beta "$TEMPORAL_DB_PASSWORD"
create_role_and_database temporal_service sigdesk_temporal_visibility_beta "$TEMPORAL_DB_PASSWORD"

psql --username "$POSTGRES_USER" --dbname sigdesk_rag_beta --set=ON_ERROR_STOP=1 \
  --command 'CREATE EXTENSION IF NOT EXISTS vector;'
