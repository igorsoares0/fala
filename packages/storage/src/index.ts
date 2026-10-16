import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Object storage for sources, thumbnails and (later) exports. Cloudflare R2 in
 * deployed environments, any S3-compatible server locally. The bucket is private:
 * browsers only ever get short-lived signed URLs, which must never be logged.
 */

export type StorageConfig = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export type ObjectInfo = { sizeBytes: number; contentType: string | null };

export function storageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): StorageConfig {
  const required = (name: string) => {
    const value = env[name];
    if (!value) throw new Error(`${name} is not set.`);
    return value;
  };
  return {
    endpoint: required("R2_ENDPOINT"),
    region: env.R2_REGION || "auto",
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    bucket: required("R2_BUCKET_NAME"),
  };
}

export function createStorage(config: StorageConfig) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    forcePathStyle: true,
    // Default checksums add x-amz-checksum-* to presigned URLs, which a browser PUT
    // can't satisfy and which R2 doesn't fully support. Only send them when required.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  const Bucket = config.bucket;

  return {
    bucket: Bucket,

    /** Starts a multipart upload (large browser uploads go in parts). Returns its id. */
    async createMultipartUpload(key: string, contentType: string): Promise<string> {
      const { UploadId } = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
      if (!UploadId) throw new Error("Storage returned no upload id.");
      return UploadId;
    },

    /** URL for a single PUT of one part of a multipart upload. */
    presignUploadPart(key: string, uploadId: string, partNumber: number, expiresInSeconds: number) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber }), {
        expiresIn: expiresInSeconds,
      });
    },

    /** Parts stored so far, in order (the server reads ETags here, so browsers never need to). */
    async listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; sizeBytes: number }[]> {
      const parts: { partNumber: number; etag: string; sizeBytes: number }[] = [];
      let marker: string | undefined;
      do {
        const page = await client.send(new ListPartsCommand({ Bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
        for (const part of page.Parts ?? []) {
          if (part.PartNumber && part.ETag) parts.push({ partNumber: part.PartNumber, etag: part.ETag, sizeBytes: part.Size ?? 0 });
        }
        marker = page.IsTruncated ? page.NextPartNumberMarker : undefined;
      } while (marker);
      return parts.sort((a, b) => a.partNumber - b.partNumber);
    },

    async completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
      await client.send(
        new CompleteMultipartUploadCommand({
          Bucket,
          Key: key,
          UploadId: uploadId,
          MultipartUpload: { Parts: parts.map((part) => ({ PartNumber: part.partNumber, ETag: part.etag })) },
        }),
      );
    },

    /** Drops an unfinished multipart upload and its parts. Safe to repeat. */
    async abortMultipartUpload(key: string, uploadId: string) {
      try {
        await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId }));
      } catch (error) {
        if (!isNotFound(error) && !(error instanceof S3ServiceException && error.name === "NoSuchUpload")) throw error;
      }
    },

    presignGet(key: string, expiresInSeconds: number, options: { downloadName?: string } = {}) {
      const command = new GetObjectCommand({
        Bucket,
        Key: key,
        ResponseContentDisposition: options.downloadName ? attachmentDisposition(options.downloadName) : undefined,
      });
      return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
    },

    /** Size and type of a stored object, or null when it doesn't exist. */
    async headObject(key: string): Promise<ObjectInfo | null> {
      try {
        const head = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { sizeBytes: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    /** Streams an object to a local file (never buffers it in memory). Returns its size. */
    async downloadToFile(key: string, filePath: string, signal?: AbortSignal): Promise<number> {
      const object = await client.send(new GetObjectCommand({ Bucket, Key: key }), { abortSignal: signal });
      if (!(object.Body instanceof Readable)) throw new Error("Unexpected object body.");
      await pipeline(object.Body, createWriteStream(filePath), { signal });
      return (await stat(filePath)).size;
    },

    async uploadFile(key: string, filePath: string, contentType: string) {
      const { size } = await stat(filePath);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: createReadStream(filePath),
          ContentLength: size,
          ContentType: contentType,
        }),
      );
    },

    async putObject(key: string, body: Uint8Array | string, contentType: string) {
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: body, ContentType: contentType }));
    },

    async deleteObject(key: string) {
      await client.send(new DeleteObjectCommand({ Bucket, Key: key }));
    },

    /** Deletes every object under `prefix`. Safe to repeat. Returns how many were deleted. */
    async deletePrefix(prefix: string): Promise<number> {
      if (!prefix.endsWith("/")) throw new Error("Prefix must end with '/'.");
      let deleted = 0;
      let continuationToken: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: continuationToken }),
        );
        const keys = (page.Contents ?? []).flatMap((object) => (object.Key ? [{ Key: object.Key }] : []));
        if (keys.length > 0) {
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: keys, Quiet: true } }));
          deleted += keys.length;
        }
        continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (continuationToken);
      return deleted;
    },

    async listKeys(prefix: string): Promise<string[]> {
      const page = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }));
      return (page.Contents ?? []).flatMap((object) => (object.Key ? [object.Key] : []));
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;

/** `Content-Disposition` for a download: an ASCII fallback plus the exact UTF-8 name (RFC 6266). */
export function attachmentDisposition(fileName: string): string {
  const fallback = fileName.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "download";
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isNotFound(error: unknown) {
  return (
    error instanceof S3ServiceException &&
    (error.name === "NotFound" || error.name === "NoSuchKey" || error.$metadata.httpStatusCode === 404)
  );
}

const globalForStorage = globalThis as unknown as { falaStorage?: Storage };

/** Shared instance configured from the environment, created on first use. */
export function getStorage(): Storage {
  globalForStorage.falaStorage ??= createStorage(storageConfigFromEnv());
  return globalForStorage.falaStorage;
}
