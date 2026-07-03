import type { Area, Discipline, Organization, Section } from "../types.js";
import type { ApiClient } from "./client.js";

export interface MasterDataPayload {
  sections: Section[];
  organizations: Organization[];
  areas: Area[];
  disciplines: Discipline[];
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
}
