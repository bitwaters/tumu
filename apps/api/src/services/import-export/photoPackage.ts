import type { PhotoAttachment, SiteItem, User } from "../../types.js";
import { toCsv } from "./csv.js";
import { buildExportFileName, safeFileName } from "./fileNames.js";
import { saveGeneratedExportArtifact } from "./artifacts.js";
import { createStoredZip, type ZipEntry } from "./zip.js";

export interface PhotoPackageInput {
  requester: User;
  items: SiteItem[];
  photos: PhotoAttachment[];
  users: Array<Pick<User, "id" | "name">>;
  generatedAt: Date;
}

const manifestHeaders = [
  "事项编号",
  "事项标题",
  "照片文件名",
  "阶段",
  "上传人",
  "上传时间",
  "标段快照",
  "区域快照",
  "专业快照",
  "责任单位快照",
  "对象键"
];

export function buildPhotoPackageExport(input: PhotoPackageInput) {
  const rows = input.items.flatMap((item) =>
    input.photos
      .filter((photo) => photo.siteItemId === item.id && !photo.deletedAt)
      .map((photo) => ({
        事项编号: item.itemNo,
        事项标题: item.title,
        照片文件名: photo.fileName,
        阶段: photo.stage ?? "",
        上传人: input.users.find((user) => user.id === photo.uploadedBy)?.name ?? photo.uploadedBy,
        上传时间: photo.uploadedAt,
        标段快照: photo.sectionSnapshot ?? "",
        区域快照: photo.areaSnapshot ?? "",
        专业快照: photo.disciplineSnapshot ?? "",
        责任单位快照: photo.responsibleOrgSnapshot ?? "",
        对象键: photo.objectKey
      }))
  );
  const manifestCsv = toCsv(manifestHeaders, rows);
  const manifestJson = JSON.stringify({ generatedAt: input.generatedAt.toISOString(), rows }, null, 2);
  const referenceFiles: ZipEntry[] = input.items.flatMap((item) =>
    input.photos
      .filter((photo) => photo.siteItemId === item.id && !photo.deletedAt)
      .map((photo) => ({
        path: `${safeFileName(item.itemNo)}/${safeFileName(photo.stage ?? "unbound")}/${safeFileName(photo.fileName, photo.id)}.txt`,
        content: [
          `itemNo=${item.itemNo}`,
          `title=${item.title}`,
          `stage=${photo.stage ?? ""}`,
          `fileName=${photo.fileName}`,
          `objectKey=${photo.objectKey}`,
          `uploadedBy=${photo.uploadedBy}`,
          `uploadedAt=${photo.uploadedAt}`
        ].join("\n")
      }))
  );

  const content = createStoredZip([
    { path: "manifest.csv", content: manifestCsv },
    { path: "manifest.json", content: manifestJson },
    ...referenceFiles
  ]);
  const fileName = buildExportFileName(["photo-package", input.requester.username], "zip", input.generatedAt);

  return saveGeneratedExportArtifact({
    artifactKey: `exports/${input.requester.id}/${safeFileName(fileName)}`,
    fileName,
    mimeType: "application/zip",
    content
  });
}
