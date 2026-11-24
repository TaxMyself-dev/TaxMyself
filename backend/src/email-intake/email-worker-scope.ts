/** Server-owned routing for the email pipeline; unset preserves legacy production SQL. */
export type EmailWorkerScope = 'local' | 'test';
export interface EmailScopeSql {
  sql: string;
  params: string[];
}
export function emailWorkerScope(
  env: NodeJS.ProcessEnv = process.env,
): EmailWorkerScope | null {
  const value = env.EMAIL_WORKER_SCOPE;
  if (value === undefined || value === '') return null;
  if (value !== 'local' && value !== 'test')
    throw new Error('EMAIL_WORKER_SCOPE must be local or test');
  if (env.NODE_ENV === 'production' || env.COMPOSIO_ENVIRONMENT !== 'dev')
    throw new Error(
      'Email worker routing requires DEV; production must leave EMAIL_WORKER_SCOPE unset',
    );
  return value;
}
export function emailRunScope(
  scope: EmailWorkerScope | null,
  column = 'worker_scope',
): EmailScopeSql {
  return scope
    ? { sql: ` AND ${column}=?`, params: [scope] }
    : { sql: '', params: [] };
}
export function emailWorkScope(
  scope: EmailWorkerScope | null,
  alias = 'imported_documents',
): EmailScopeSql {
  return scope
    ? {
        sql: ` AND EXISTS (SELECT 1 FROM email_import_runs scope_run WHERE scope_run.id=${alias}.email_run_id AND scope_run.firebase_id=${alias}.firebase_id AND scope_run.worker_scope=?)`,
        params: [scope],
      }
    : { sql: '', params: [] };
}
export function emailAnalysisScope(
  scope: EmailWorkerScope | null,
  alias = 'document_processing_jobs',
): EmailScopeSql {
  return scope
    ? {
        sql: ` AND (${alias}.purpose<>'GMAIL' OR EXISTS (SELECT 1 FROM imported_documents scope_doc JOIN email_import_runs scope_run ON scope_run.id=scope_doc.email_run_id AND scope_run.firebase_id=scope_doc.firebase_id WHERE scope_doc.id=CAST(JSON_UNQUOTE(JSON_EXTRACT(${alias}.context_json,'$.importId')) AS UNSIGNED) AND scope_doc.firebase_id=${alias}.owner AND scope_doc.business_number=${alias}.business AND scope_run.worker_scope=?))`,
        params: [scope],
      }
    : { sql: '', params: [] };
}
export function emailProtectedRootScope(
  scope: EmailWorkerScope | null,
  alias = 'protected_documents',
): EmailScopeSql {
  return scope
    ? {
        sql: ` AND (${alias}.source<>'GMAIL' OR EXISTS (SELECT 1 FROM email_import_runs scope_run WHERE scope_run.id=COALESCE((SELECT scope_doc.email_run_id FROM imported_documents scope_doc WHERE scope_doc.id=${alias}.original_import_id AND scope_doc.firebase_id=${alias}.firebase_id AND scope_doc.business_number=${alias}.business_number),JSON_UNQUOTE(JSON_EXTRACT(${alias}.metadata_json,'$.emailRunId'))) AND scope_run.firebase_id=${alias}.firebase_id AND scope_run.worker_scope=?))`,
        params: [scope],
      }
    : { sql: '', params: [] };
}
export function emailProtectedOperationScope(
  scope: EmailWorkerScope | null,
): EmailScopeSql {
  if (!scope) return { sql: '', params: [] };
  const root = emailProtectedRootScope(scope, 'scope_root');
  return {
    sql: ` AND EXISTS (SELECT 1 FROM protected_documents scope_root WHERE scope_root.id=document_replacement_operations.protected_id AND scope_root.firebase_id=document_replacement_operations.firebase_id AND scope_root.business_number=document_replacement_operations.business_number${root.sql})`,
    params: root.params,
  };
}
