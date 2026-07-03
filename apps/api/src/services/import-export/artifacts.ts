export interface GeneratedExportArtifact {
  artifactKey: string;
  fileName: string;
  mimeType: string;
  content: Uint8Array;
}

const generatedArtifacts = new Map<string, GeneratedExportArtifact>();

export function saveGeneratedExportArtifact(artifact: GeneratedExportArtifact): GeneratedExportArtifact {
  generatedArtifacts.set(artifact.artifactKey, artifact);
  return artifact;
}

export function readGeneratedExportArtifact(artifactKey: string): GeneratedExportArtifact | undefined {
  return generatedArtifacts.get(artifactKey);
}
