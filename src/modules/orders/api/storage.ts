import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { safeDownloadName } from "../model/fileRules";

/**
 * Object storage for case-file photos, video and documents.
 *
 * An interface with one implementation, for the same reason `AuctionSource`
 * is: nothing above this line should know the word "R2". If the bucket ever
 * moves, it moves here.
 *
 * The bucket is private and has no public URL, so **every read is a signed
 * URL** issued by a route that has already checked who is asking. There is no
 * path by which knowing a storage key gets you a file.
 */
export interface ObjectStorage {
  /**
   * A URL the browser may PUT exactly one object to.
   *
   * `contentType` and `sizeBytes` are part of the signature, not advice —
   * see `presignUpload` below for why that distinction is the whole point.
   */
  presignUpload(input: {
    key: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ url: string; expiresAt: Date }>;

  /** A short-lived URL that serves the object, named for the download. */
  presignDownload(input: {
    key: string;
    fileName?: string;
    /** `attachment` forces a download; `inline` lets an <img> or <video> use it. */
    disposition?: "inline" | "attachment";
    expiresInSeconds?: number;
  }): Promise<string>;

  /** Server-side write — used to copy auction photos in at order creation. */
  put(input: { key: string; body: Uint8Array; contentType: string }): Promise<void>;

  /** Null when the object isn't there, so a caller can tell "missing" from "empty". */
  head(key: string): Promise<{ sizeBytes: number; contentType?: string } | null>;

  remove(key: string): Promise<void>;
  /** Batched; S3 caps a single call at 1000 keys and this chunks accordingly. */
  removeMany(keys: string[]): Promise<void>;
}

/**
 * Upload links last long enough for a 500 MB video on a terminal's upstream —
 * roughly 13 minutes at 5 Mbps, so 30 gives room without leaving a write
 * credential lying around for an hour.
 */
const UPLOAD_TTL_SECONDS = 30 * 60;

/**
 * Downloads default to an hour because a gallery's URLs sit in already-rendered
 * HTML: a five-minute link breaks the page of anyone who leaves a tab open,
 * and the fix for that is not to make people reload.
 */
const DOWNLOAD_TTL_SECONDS = 60 * 60;

interface R2Config {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

function readConfig(): R2Config | null {
  const endpoint = process.env.R2_ENDPOINT?.trim();
  const bucket = process.env.R2_BUCKET?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey };
}

let cached: ObjectStorage | null | undefined;
let warned = false;

/**
 * The configured storage, or **null when the environment has no bucket**.
 *
 * Null rather than a thrown error, and the same reasoning as
 * `getAuctionSource()`: a missing environment variable must degrade one
 * feature, never take down a request. A deployment without R2 configured still
 * serves the whole site; only the case-file upload controls report themselves
 * unavailable. Throwing here would turn a forgotten Vercel variable into a
 * blank page.
 *
 * Callers must handle null. That is deliberately unpleasant enough to be
 * noticed at the call site.
 */
export function getObjectStorage(): ObjectStorage | null {
  if (cached !== undefined) return cached;

  const config = readConfig();
  if (!config) {
    if (!warned) {
      warned = true;
      console.warn(
        "[orders] R2 is not configured (R2_ENDPOINT / R2_BUCKET / R2_ACCESS_KEY_ID / " +
          "R2_SECRET_ACCESS_KEY). Case-file uploads and downloads are unavailable."
      );
    }
    cached = null;
    return null;
  }

  cached = new R2Storage(config);
  return cached;
}

/** Test seam. Nothing in the application calls this. */
export function resetObjectStorageForTests(): void {
  cached = undefined;
  warned = false;
}

class R2Storage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: R2Config) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      /**
       * R2 has no AWS regions; the endpoint's jurisdiction (EU, here) decides
       * where bytes live. The SDK still demands the field.
       */
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      /**
       * ⚠️ Load-bearing, and non-obvious enough that removing them looks safe.
       *
       * Recent AWS SDK versions attach a CRC32 checksum header to every
       * request by default. On a PRESIGNED url that means the signature covers
       * a header the browser will never send — so the upload is signed
       * perfectly and rejected anyway, with an error that points at the
       * signature rather than at this. `WHEN_REQUIRED` restores the older
       * behaviour of only checksumming where the operation demands it.
       */
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  /**
   * A presigned PUT is a bearer token for writing to our bucket: whoever holds
   * it can store an object, and no server code runs when they use it. So the
   * limits have to live in the signature itself.
   *
   * `signableHeaders` is what does that. Without it the SDK signs little more
   * than the host, and the declared content type and size become suggestions —
   * a link issued for a 2 MB PDF would happily accept a 4 GB file of anything.
   * With `content-length` signed, R2 rejects any body that is not exactly the
   * size the server agreed to, and the browser sets that header itself from
   * `file.size`, so an honest client needs to do nothing.
   *
   * `checkUpload()` in the model decides *whether* to sign. This decides what
   * the signature binds.
   */
  async presignUpload({
    key,
    contentType,
    sizeBytes,
  }: {
    key: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ url: string; expiresAt: Date }> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: sizeBytes,
      }),
      {
        expiresIn: UPLOAD_TTL_SECONDS,
        signableHeaders: new Set(["content-type", "content-length"]),
      }
    );
    return { url, expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000) };
  }

  async presignDownload({
    key,
    fileName,
    disposition = "inline",
    expiresInSeconds = DOWNLOAD_TTL_SECONDS,
  }: {
    key: string;
    fileName?: string;
    disposition?: "inline" | "attachment";
    expiresInSeconds?: number;
  }): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        // Without this a document downloads as the uuid the key is built from.
        // The name is sanitised in the model, because it reaches a header.
        ResponseContentDisposition: fileName
          ? `${disposition}; filename="${safeDownloadName(fileName)}"`
          : undefined,
      }),
      { expiresIn: expiresInSeconds }
    );
  }

  async put({
    key,
    body,
    contentType,
  }: {
    key: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
  }

  async head(key: string): Promise<{ sizeBytes: number; contentType?: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key })
      );
      return { sizeBytes: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (e) {
      // A missing object is an answer, not a failure — it is exactly what
      // "did that upload actually finish?" asks. Anything else is a real
      // error and must not be flattened into "no".
      if (isNotFound(e)) return null;
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async removeMany(keys: string[]): Promise<void> {
    for (let i = 0; i < keys.length; i += 1000) {
      const chunk = keys.slice(i, i + 1000);
      if (chunk.length === 0) continue;
      await this.client.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      );
    }
  }
}

/**
 * S3 signals a missing object three different ways depending on the operation
 * and the implementation — `NotFound` from HEAD, `NoSuchKey` from GET, and a
 * bare 404 from some S3-compatible services. Checking only one of them is how
 * a missing file starts reading as a server error.
 */
function isNotFound(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    err.name === "NotFound" ||
    err.name === "NoSuchKey" ||
    err.$metadata?.httpStatusCode === 404
  );
}
