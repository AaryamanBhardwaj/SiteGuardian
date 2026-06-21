import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const s3 = new S3Client({});
const BUCKET = process.env.SCREENSHOT_BUCKET || "siteguardian-screenshots";
const DIFF_WIDTH = 1280;

async function getS3Buffer(key) {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
  );
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function webpToPngBuffer(webpBuf) {
  return sharp(webpBuf)
    .resize(DIFF_WIDTH)
    .png()
    .toBuffer();
}

export async function computeVisualDiff(prevScreenshotKey, currScreenshotKey, projectId, scanTimestamp) {
  if (!prevScreenshotKey || !currScreenshotKey) {
    return null;
  }

  try {
    const [prevWebp, currWebp] = await Promise.all([
      getS3Buffer(prevScreenshotKey),
      getS3Buffer(currScreenshotKey),
    ]);

    const [prevPng, currPng] = await Promise.all([
      webpToPngBuffer(prevWebp),
      webpToPngBuffer(currWebp),
    ]);

    const prevImg = PNG.sync.read(prevPng);
    const currImg = PNG.sync.read(currPng);

    const height = Math.min(prevImg.height, currImg.height);
    const width = DIFF_WIDTH;

    const prevResized = await sharp(prevWebp).resize(width, height, { fit: "cover", position: "top" }).png().toBuffer();
    const currResized = await sharp(currWebp).resize(width, height, { fit: "cover", position: "top" }).png().toBuffer();

    const prev = PNG.sync.read(prevResized);
    const curr = PNG.sync.read(currResized);

    const diff = new PNG({ width, height });

    const mismatchedPixels = pixelmatch(
      prev.data,
      curr.data,
      diff.data,
      width,
      height,
      { threshold: 0.1 },
    );

    const totalPixels = width * height;
    const diffPercent = Math.round((mismatchedPixels / totalPixels) * 10000) / 100;

    const diffPngBuf = PNG.sync.write(diff);
    const diffWebpBuf = await sharp(diffPngBuf).webp({ quality: 80 }).toBuffer();

    const diffKey = `diffs/${projectId}/${scanTimestamp}.webp`;
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: diffKey,
        Body: diffWebpBuf,
        ContentType: "image/webp",
      }),
    );

    return {
      diffS3Key: diffKey,
      diffPercent,
      mismatchedPixels,
      totalPixels,
    };
  } catch (err) {
    console.error("Visual diff failed:", err.message);
    return null;
  }
}
