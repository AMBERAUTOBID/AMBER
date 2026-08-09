import { getObjectStorage } from "./storage";
import type { OrderFileKind } from "../model/fileRules";

export interface SignedFile {
  id: string;
  stage: string;
  kind: OrderFileKind;
  fileName: string;
  caption: string | null;
  sizeBytes: number | null;
  visibleToClient: boolean;
  source: string;
  /** Null when the upload never completed, or when storage is unconfigured. */
  url: string | null;
}

interface FileRow {
  id: string;
  stage: string;
  kind: string;
  fileName: string;
  caption: string | null;
  sizeBytes: number | null;
  visibleToClient: boolean;
  source: string;
  storageKey: string;
  uploadedAt: Date | null;
}

/**
 * Turns stored file rows into URLs a browser can actually load.
 *
 * The bucket is private and has no public URL, so this is the ONLY way a
 * photo reaches a page — which is what makes "who may see this" a question
 * answered before the signature exists rather than after. Callers filter by
 * `visibleToClient` BEFORE calling; anything passed in here gets a working
 * link.
 *
 * Files that never finished uploading get `url: null` rather than a signature
 * for an object that isn't there. A broken image in a gallery is a support
 * question; a caption saying nothing arrived is an answer.
 */
export async function signFiles(rows: FileRow[]): Promise<SignedFile[]> {
  const storage = getObjectStorage();

  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      stage: row.stage,
      kind: row.kind as OrderFileKind,
      fileName: row.fileName,
      caption: row.caption,
      sizeBytes: row.sizeBytes,
      visibleToClient: row.visibleToClient,
      source: row.source,
      url:
        storage && row.uploadedAt
          ? await storage.presignDownload({
              key: row.storageKey,
              fileName: row.fileName,
              // Photos and video are meant to be looked at in the page;
              // a document is meant to be kept.
              disposition: row.kind === "document" ? "attachment" : "inline",
            })
          : null,
    }))
  );
}
