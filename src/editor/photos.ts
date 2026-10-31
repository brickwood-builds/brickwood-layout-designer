// Photos of physical builds: shrunk before they are stored on this device.
const MAX = 1600;
const THUMB = 160;

async function draw(img: ImageBitmap, max: number): Promise<HTMLCanvasElement> {
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k));
  c.height = Math.max(1, Math.round(img.height * k));
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** A downscaled JPEG and a small preview from a picked or taken photo. */
export async function preparePhoto(file: Blob): Promise<{ blob: Blob; thumb: string }> {
  const img = await createImageBitmap(file);
  try {
    const big = await draw(img, MAX);
    const blob = await new Promise<Blob>((resolve, reject) => big.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the photo'))), 'image/jpeg', 0.85));
    const thumb = (await draw(img, THUMB)).toDataURL('image/jpeg', 0.8);
    return { blob, thumb };
  } finally {
    img.close();
  }
}
