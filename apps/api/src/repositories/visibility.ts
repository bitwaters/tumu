import type { Prisma } from "@prisma/client";
import type { User } from "../types.js";

export function siteItemVisibilityWhere(user: User): Prisma.SiteItemWhereInput {
  if (user.role === "admin") return {};

  const sectionFilter: Prisma.SiteItemWhereInput = {
    sectionId: {
      in: user.sectionScopeIds
    }
  };

  if (user.role === "supervisor") return sectionFilter;
  if (user.role === "contractor_manager") {
    return {
      AND: [sectionFilter, { responsibleOrgId: user.organizationId }]
    };
  }

  return {
    AND: [sectionFilter, { responsibleUserId: user.id }]
  };
}
