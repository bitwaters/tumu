import { notFound } from "../../errors.js";
import type { PhotoAttachment, User } from "../../types.js";
import type { PhotoListFilters, PhotosRepository } from "../../repositories/photos/index.js";

export class PhotosService {
  constructor(private readonly repository: PhotosRepository) {}

  async list(viewer: User, filters: PhotoListFilters = {}): Promise<PhotoAttachment[]> {
    return this.repository.list(viewer, filters);
  }

  async previewObjectKey(viewer: User, photoId: string): Promise<string> {
    const photo = await this.repository.findPreviewableById(viewer, photoId);
    if (!photo) throw notFound("Photo not found");
    return photo.objectKey;
  }
}
