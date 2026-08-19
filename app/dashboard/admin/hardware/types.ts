import type { STATUS_LABELS } from "./labels";

export type AssetRow = {
  id: string;
  asset_tag: string;
  category: string;
  model: string;
  serial_number: string;
  status: keyof typeof STATUS_LABELS;
  assigned_to: string | null;
  profiles: { full_name: string; email: string } | null;
};

export type ContractRow = {
  id: string;
  asset_id: string;
  signed_at: string | null;
  storage_path: string;
};

export type AssetWithContract = AssetRow & {
  contract: ContractRow | null;
  contractSignedUrl: string | null;
};
