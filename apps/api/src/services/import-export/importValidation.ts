import type { Area, Discipline, ImportKind, ImportRowError, Organization, OrganizationType, Role, Section, User } from "../../types.js";
import { csvRowsToObjects, parseCsv, type CsvRow } from "./csv.js";

export interface ImportReferenceData {
  organizations: Organization[];
  sections: Section[];
  areas: Area[];
  disciplines: Discipline[];
  users: Array<Pick<User, "username" | "phone">>;
}

export type NormalizedImportRow =
  | { kind: "organizations"; rowNumber: number; data: { name: string; type: OrganizationType; isActive: boolean } }
  | { kind: "sections"; rowNumber: number; data: { name: string; code: string; isActive: boolean } }
  | { kind: "areas"; rowNumber: number; data: { name: string; code: string; parentId?: string; isActive: boolean } }
  | { kind: "disciplines"; rowNumber: number; data: { name: string; code: string; isActive: boolean } }
  | {
      kind: "users";
      rowNumber: number;
      data: {
        organizationId: string;
        name: string;
        phone: string;
        username: string;
        role: Role;
        password: string;
        sectionScopeIds: string[];
        isActive: boolean;
      };
    };

export interface ImportValidationResult {
  accepted: NormalizedImportRow[];
  errors: ImportRowError[];
  rejectedRows: number;
}

const organizationTypes = ["owner", "supervisor", "contractor", "other"] as const;
const roles = ["admin", "supervisor", "contractor_manager", "rectifier"] as const;

export function validateImportCsv(kind: ImportKind, csvText: string, references: ImportReferenceData): ImportValidationResult {
  const rows = csvRowsToObjects(parseCsv(csvText));
  const errors: ImportRowError[] = [];
  const accepted: NormalizedImportRow[] = [];
  let rejectedRows = 0;
  const seen = createSeen(references);

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const rowErrors: ImportRowError[] = [];
    const normalized = normalizeRow(kind, row, rowNumber, references, seen, rowErrors);
    if (rowErrors.length > 0 || !normalized) {
      errors.push(...rowErrors);
      rejectedRows += 1;
      return;
    }
    markSeen(seen, normalized);
    accepted.push(normalized);
  });

  if (rows.length === 0) {
    errors.push({ rowNumber: 1, message: "CSV file has no data rows" });
    rejectedRows = 1;
  }

  return { accepted, errors, rejectedRows };
}

function normalizeRow(
  kind: ImportKind,
  row: CsvRow,
  rowNumber: number,
  references: ImportReferenceData,
  seen: SeenValues,
  errors: ImportRowError[]
): NormalizedImportRow | undefined {
  if (kind === "organizations") return normalizeOrganization(row, rowNumber, seen, errors);
  if (kind === "sections") return normalizeCodeRecord("sections", row, rowNumber, seen.sectionCodes, errors);
  if (kind === "areas") return normalizeArea(row, rowNumber, references, seen, errors);
  if (kind === "disciplines") return normalizeCodeRecord("disciplines", row, rowNumber, seen.disciplineCodes, errors);
  return normalizeUser(row, rowNumber, references, seen, errors);
}

function normalizeOrganization(row: CsvRow, rowNumber: number, seen: SeenValues, errors: ImportRowError[]): NormalizedImportRow | undefined {
  const name = requireText(row, "name", rowNumber, errors, "name", "名称");
  const type = requireEnum(row, "type", organizationTypes, rowNumber, errors, "type", "类型");
  const isActive = readActive(row, rowNumber, errors);
  if (name && seen.organizationNames.has(name)) errors.push({ rowNumber, field: "name", message: "organization name already exists" });
  if (!name || !type || isActive === undefined) return undefined;
  return { kind: "organizations", rowNumber, data: { name, type, isActive } };
}

function normalizeCodeRecord(
  kind: "sections" | "disciplines",
  row: CsvRow,
  rowNumber: number,
  seenCodes: Set<string>,
  errors: ImportRowError[]
): NormalizedImportRow | undefined {
  const name = requireText(row, "name", rowNumber, errors, "name", "名称");
  const code = requireText(row, "code", rowNumber, errors, "code", "编码");
  const isActive = readActive(row, rowNumber, errors);
  if (code && seenCodes.has(code)) errors.push({ rowNumber, field: "code", message: "code already exists" });
  if (!name || !code || isActive === undefined) return undefined;
  return { kind, rowNumber, data: { name, code, isActive } };
}

function normalizeArea(row: CsvRow, rowNumber: number, references: ImportReferenceData, seen: SeenValues, errors: ImportRowError[]): NormalizedImportRow | undefined {
  const name = requireText(row, "name", rowNumber, errors, "name", "名称");
  const code = requireText(row, "code", rowNumber, errors, "code", "编码");
  const parentId = readText(row, "parentId", "父级ID");
  const isActive = readActive(row, rowNumber, errors);
  if (code && seen.areaCodes.has(code)) errors.push({ rowNumber, field: "code", message: "code already exists" });
  if (parentId && !references.areas.some((area) => area.id === parentId)) errors.push({ rowNumber, field: "parentId", message: "parentId is invalid" });
  if (!name || !code || isActive === undefined || errors.some((error) => error.rowNumber === rowNumber)) return undefined;
  return { kind: "areas", rowNumber, data: { name, code, parentId, isActive } };
}

function normalizeUser(row: CsvRow, rowNumber: number, references: ImportReferenceData, seen: SeenValues, errors: ImportRowError[]): NormalizedImportRow | undefined {
  const organizationId = requireText(row, "organizationId", rowNumber, errors, "organizationId", "单位ID");
  const name = requireText(row, "name", rowNumber, errors, "name", "姓名");
  const phone = requireText(row, "phone", rowNumber, errors, "phone", "手机号");
  const username = requireText(row, "username", rowNumber, errors, "username", "账号");
  const role = requireEnum(row, "role", roles, rowNumber, errors, "role", "角色");
  const password = readText(row, "password", "密码") || "password123";
  const sectionScopeIds = splitList(readText(row, "sectionScopeIds", "标段权限"));
  const isActive = readActive(row, rowNumber, errors);

  if (phone && !/^\+?\d{6,20}$/.test(phone)) errors.push({ rowNumber, field: "phone", message: "phone format is invalid" });
  if (username && seen.usernames.has(username)) errors.push({ rowNumber, field: "username", message: "username already exists" });
  if (phone && seen.phones.has(phone)) errors.push({ rowNumber, field: "phone", message: "phone already exists" });
  const organization = references.organizations.find((candidate) => candidate.id === organizationId);
  if (organizationId && !organization) errors.push({ rowNumber, field: "organizationId", message: "organizationId is invalid" });
  if (organization && role && (role === "contractor_manager" || role === "rectifier") && organization.type !== "contractor") {
    errors.push({ rowNumber, field: "organizationId", message: "contractor users require a contractor organization" });
  }
  const missingSection = sectionScopeIds.find((sectionId) => !references.sections.some((section) => section.id === sectionId));
  if (missingSection) errors.push({ rowNumber, field: "sectionScopeIds", message: `sectionScopeId ${missingSection} is invalid` });
  if (sectionScopeIds.length === 0) errors.push({ rowNumber, field: "sectionScopeIds", message: "sectionScopeIds is required" });

  if (!organizationId || !name || !phone || !username || !role || isActive === undefined || errors.some((error) => error.rowNumber === rowNumber)) return undefined;
  return { kind: "users", rowNumber, data: { organizationId, name, phone, username, role, password, sectionScopeIds, isActive } };
}

function requireText(row: CsvRow, field: string, rowNumber: number, errors: ImportRowError[], ...aliases: string[]): string | undefined {
  const value = readText(row, field, ...aliases);
  if (!value) errors.push({ rowNumber, field, message: `${field} is required` });
  return value;
}

function requireEnum<T extends string>(
  row: CsvRow,
  field: string,
  allowed: readonly T[],
  rowNumber: number,
  errors: ImportRowError[],
  ...aliases: string[]
): T | undefined {
  const value = requireText(row, field, rowNumber, errors, field, ...aliases);
  if (!value) return undefined;
  if (!allowed.includes(value as T)) {
    errors.push({ rowNumber, field, message: `${field} is invalid` });
    return undefined;
  }
  return value as T;
}

function readActive(row: CsvRow, rowNumber: number, errors: ImportRowError[]): boolean | undefined {
  const value = readText(row, "isActive", "启用");
  if (!value) return true;
  if (["true", "1", "yes", "是", "启用"].includes(value)) return true;
  if (["false", "0", "no", "否", "停用"].includes(value)) return false;
  errors.push({ rowNumber, field: "isActive", message: "isActive is invalid" });
  return undefined;
}

function readText(row: CsvRow, field: string, ...aliases: string[]): string | undefined {
  for (const key of [field, ...aliases]) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[|;,，；]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

interface SeenValues {
  organizationNames: Set<string>;
  sectionCodes: Set<string>;
  areaCodes: Set<string>;
  disciplineCodes: Set<string>;
  usernames: Set<string>;
  phones: Set<string>;
}

function createSeen(references: ImportReferenceData): SeenValues {
  return {
    organizationNames: new Set(references.organizations.map((organization) => organization.name)),
    sectionCodes: new Set(references.sections.map((section) => section.code)),
    areaCodes: new Set(references.areas.map((area) => area.code)),
    disciplineCodes: new Set(references.disciplines.map((discipline) => discipline.code)),
    usernames: new Set(references.users.map((user) => user.username)),
    phones: new Set(references.users.map((user) => user.phone))
  };
}

function markSeen(seen: SeenValues, row: NormalizedImportRow): void {
  if (row.kind === "organizations") seen.organizationNames.add(row.data.name);
  if (row.kind === "sections") seen.sectionCodes.add(row.data.code);
  if (row.kind === "areas") seen.areaCodes.add(row.data.code);
  if (row.kind === "disciplines") seen.disciplineCodes.add(row.data.code);
  if (row.kind === "users") {
    seen.usernames.add(row.data.username);
    seen.phones.add(row.data.phone);
  }
}
