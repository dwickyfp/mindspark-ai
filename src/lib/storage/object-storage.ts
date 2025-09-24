import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "node:stream";

const REQUIRED_ENV_VARS = ["STORAGE_S3_BUCKET", "STORAGE_S3_REGION"] as const;

type RequiredEnv = (typeof REQUIRED_ENV_VARS)[number];

type UploadBody = Buffer | Uint8Array | Blob | Readable | string;

let client: S3Client | null = null;

function getEnv(name: RequiredEnv): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function getS3Client(): S3Client {
  if (client) return client;

  const region = getEnv("STORAGE_S3_REGION");
  const endpoint = process.env.STORAGE_S3_ENDPOINT;
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY;
  const forcePathStyle = process.env.STORAGE_S3_FORCE_PATH_STYLE === "true";

  client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
          }
        : undefined,
  });

  return client;
}

export function getStorageBucket(): string {
  return getEnv("STORAGE_S3_BUCKET");
}

export async function uploadObject(options: {
  key: string;
  body: UploadBody;
  contentType?: string;
  checksum?: string;
  metadata?: Record<string, string>;
}): Promise<void> {
  const bucket = getStorageBucket();
  const s3 = getS3Client();
  const { key, body, contentType, checksum, metadata } = options;

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ChecksumSHA256: checksum,
      Metadata: metadata,
    },
  });

  await uploader.done();
}

export async function deleteObject(key: string): Promise<void> {
  const bucket = getStorageBucket();
  const s3 = getS3Client();
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function getObjectStream(key: string): Promise<Readable> {
  const bucket = getStorageBucket();
  const s3 = getS3Client();
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );

  const body = response.Body;
  if (!body) {
    throw new Error(`Object ${key} not found`);
  }

  if (body instanceof Readable) {
    return body;
  }

  if (typeof body === "string") {
    return Readable.from([Buffer.from(body)]);
  }

  if (body instanceof Uint8Array) {
    return Readable.from([Buffer.from(body)]);
  }

  if (typeof (body as any).transformToByteArray === "function") {
    const bytes = await (body as any).transformToByteArray();
    return Readable.from([Buffer.from(bytes)]);
  }

  throw new Error("Unsupported S3 body type");
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function generateDocumentStorageKey(options: {
  knowledgeBaseId: string;
  documentId: string;
  fileName: string;
}): string {
  const sanitized = options.fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-\./g, ".");
  const finalName = sanitized.length ? sanitized : "document";
  return `knowledge-bases/${options.knowledgeBaseId}/${options.documentId}/${finalName}`;
}
