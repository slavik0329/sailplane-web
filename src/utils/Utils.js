import { unixfs } from '@helia/unixfs';
import { CID } from 'multiformats/cid';
import JSZip from 'jszip';

/**
 * Get file info from CID using Helia
 * @param {string} cidStr - CID string
 * @param {object} helia - Helia instance
 * @returns {Promise<{size: number, type: string}>}
 */
export async function getFileInfoFromCID(cidStr, helia) {
  try {
    const fs = unixfs(helia);
    const cid = CID.parse(cidStr);
    const stat = await fs.stat(cid);
    return {
      size: Number(stat.fileSize || stat.dagSize || 0),
      type: stat.type === 'directory' ? 'dir' : 'file',
    };
  } catch (error) {
    console.error('Error getting file info:', error);
    return { size: 0, type: 'file' };
  }
}

/**
 * Get blob from a path in the shared filesystem
 * @param {object} sharedFs - SharedFS ref
 * @param {string} path - File path
 * @param {object} helia - Helia instance
 * @returns {Promise<Blob>}
 */
export async function getBlobFromPath(sharedFs, path, helia) {
  const cidStr = await sharedFs.current.read(path);
  return getBlobFromCID(cidStr, helia);
}

/**
 * Get blob from CID and path
 * @param {string} cidStr - CID string
 * @param {string} path - File path (for naming)
 * @param {object} helia - Helia instance
 * @returns {Promise<Blob>}
 */
export async function getBlobFromPathCID(cidStr, path, helia) {
  return getBlobFromCID(cidStr, helia);
}

/**
 * Get blob from CID using Helia
 * @param {string} cidStr - CID string
 * @param {object} helia - Helia instance
 * @returns {Promise<Blob>}
 */
async function getBlobFromCID(cidStr, helia) {
  const fs = unixfs(helia);
  const cid = CID.parse(cidStr);

  try {
    const stat = await fs.stat(cid);

    if (stat.type === 'directory') {
      // Handle directory - create zip
      return await dirToBlob(cid, fs);
    } else {
      // Handle file
      const chunks = [];
      for await (const chunk of fs.cat(cid)) {
        chunks.push(chunk);
      }
      return new Blob(chunks);
    }
  } catch (error) {
    console.error('Error getting blob:', error);
    throw error;
  }
}

/**
 * Convert directory to zip blob
 * @param {CID} cid - Directory CID
 * @param {object} fs - UnixFS instance
 * @returns {Promise<Blob>}
 */
async function dirToBlob(cid, fs) {
  const zip = new JSZip();

  async function addToZip(currentCid, currentPath) {
    for await (const entry of fs.ls(currentCid)) {
      const entryPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

      if (entry.type === 'directory') {
        zip.folder(entryPath);
        await addToZip(entry.cid, entryPath);
      } else {
        const chunks = [];
        for await (const chunk of fs.cat(entry.cid)) {
          chunks.push(chunk);
        }
        const blob = new Blob(chunks);
        zip.file(entryPath, blob);
      }
    }
  }

  await addToZip(cid, '');
  return await zip.generateAsync({ type: 'blob' });
}

export function getFileExtensionFromFilename(filename) {
  const fileParts = filename.split('.');
  return fileParts[fileParts.length - 1];
}

export const supportedPreviewExtensions = [
  'jpg',
  'png',
  'gif',
  'mp3',
  'ogg',
  'flac',
  'jpeg',
];

export function isFileExtensionSupported(fileExtension) {
  return supportedPreviewExtensions.includes(fileExtension.toLowerCase());
}

export async function sha256(str) {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder('utf-8').encode(str),
  );
  return Array.prototype.map
    .call(new Uint8Array(buf), (x) => ('00' + x.toString(16)).slice(-2))
    .join('');
}

export function humanFileSize(bytes, si = true, dp = 1) {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10 ** dp;

  do {
    bytes /= thresh;
    ++u;
  } while (
    Math.round(Math.abs(bytes) * r) / r >= thresh &&
    u < units.length - 1
  );

  return bytes.toFixed(dp) + ' ' + units[u];
}
