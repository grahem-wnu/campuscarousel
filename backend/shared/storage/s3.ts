// Presigned access to the private documents S3 bucket (v2.1 F2). The shared seam is `DocumentStore`
// so handlers/tests inject a fake; production resolves a real S3 client lazily (built on first use)
// so importing this module never reaches AWS. Bytes flow browser <-> S3 directly via short-lived
// presigned URLs — they never pass through the Lambda, and the bucket is never public.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface DocumentStore {
  /** Short-lived PUT url the browser uploads to directly. */
  presignUpload(key: string, contentType: string): Promise<string>;
  /** Short-lived GET url that downloads as an attachment with the original filename. */
  presignDownload(key: string, fileName: string): Promise<string>;
  remove(key: string): Promise<void>;
}

const UPLOAD_TTL_SECONDS = 300; // 5 min to start the upload
const DOWNLOAD_TTL_SECONDS = 60; // 1 min — the browser redeems it immediately

export function s3DocumentStore(bucket: string, region?: string): DocumentStore {
  let client: S3Client | undefined;
  const get = (): S3Client => (client ??= new S3Client(region ? { region } : {}));
  return {
    presignUpload(key, contentType) {
      return getSignedUrl(get(), new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
        expiresIn: UPLOAD_TTL_SECONDS,
      });
    },
    presignDownload(key, fileName) {
      const safe = fileName.replace(/["\\\r\n]/g, '');
      return getSignedUrl(
        get(),
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentDisposition: `attachment; filename="${safe}"`,
        }),
        { expiresIn: DOWNLOAD_TTL_SECONDS },
      );
    },
    async remove(key) {
      await get().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
  };
}

export function s3DocumentStoreFromEnv(env: NodeJS.ProcessEnv = process.env): DocumentStore {
  const bucket = env.DOCUMENTS_BUCKET;
  if (!bucket) throw new Error('DOCUMENTS_BUCKET is not set');
  return s3DocumentStore(bucket, env.SES_REGION ?? env.AWS_REGION);
}
