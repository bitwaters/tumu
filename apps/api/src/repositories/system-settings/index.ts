import type { RepositoryContext } from "../context.js";

export interface SystemSettingRecord {
  key: string;
  value: string;
}

export class SystemSettingsRepository {
  constructor(private readonly context: RepositoryContext) {}

  async list(): Promise<SystemSettingRecord[]> {
    return this.context.prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
      select: { key: true, value: true }
    });
  }

  async map(): Promise<Record<string, string>> {
    const records = await this.list();
    return Object.fromEntries(records.map((record) => [record.key, record.value]));
  }

  async upsertMany(values: Record<string, string>, actorId: string): Promise<void> {
    await this.context.prisma.$transaction(
      Object.entries(values).map(([key, value]) =>
        this.context.prisma.systemSetting.upsert({
          where: { key },
          create: { key, value, updatedBy: actorId },
          update: { value, updatedBy: actorId }
        })
      )
    );
  }
}
