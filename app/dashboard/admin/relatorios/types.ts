export type DeniedRequestRow = {
  id: string;
  review_notes: string | null;
  decision_at: string | null;
  access_catalog: { name: string } | null;
  requested_system_name: string | null;
  requester: { full_name: string } | null;
};

export type PendingCheckinAssetRow = {
  id: string;
  asset_tag: string;
  profiles: { full_name: string } | null;
};

export type AuditLogRow = {
  id: number;
  table_name: string;
  action: string;
  created_at: string;
  profiles: { full_name: string } | null;
};
