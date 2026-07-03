import type { Area, Discipline, Organization, Section } from "../types.js";
import type { ApiClient } from "./client.js";

export type MasterDataKind = "sections" | "organizations" | "areas" | "disciplines";
export type MasterDataRecord = Section | Organization | Area | Discipline;

export interface MasterDataPayload {
  sections: Section[];
  organizations: Organization[];
  areas: Area[];
  disciplines: Discipline[];
}

export interface MasterDataWriteInput {
  name?: string;
  code?: string;
  isActive?: boolean;
  type?: Organization["type"];
  parentId?: string | null;
}

export class MasterDataApi {
  constructor(private readonly client: ApiClient) {}

  async all(): Promise<MasterDataPayload> {
    const [sections, organizations, areas, disciplines] = await Promise.all([
      this.client.get<Section[]>("/master-data/sections"),
      this.client.get<Organization[]>("/master-data/organizations"),
      this.client.get<Area[]>("/master-data/areas"),
      this.client.get<Discipline[]>("/master-data/disciplines")
    ]);
    return { sections, organizations, areas, disciplines };
  }

  create(kind: MasterDataKind, input: MasterDataWriteInput): Promise<MasterDataRecord> {
    return this.client.post<MasterDataRecord>(`/master-data/${kind}`, input);
  }

  update(kind: MasterDataKind, id: string, input: MasterDataWriteInput): Promise<MasterDataRecord> {
    return this.client.patch<MasterDataRecord>(`/master-data/${kind}/${id}`, input);
  }
}
