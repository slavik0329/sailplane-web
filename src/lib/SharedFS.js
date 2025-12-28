import { mfs } from '@helia/mfs';
import { unixfs } from '@helia/unixfs';
import { createOrbitDB } from '@orbitdb/core';
import { EventEmitter } from 'events';

/**
 * SharedFS - A replacement for sailplane-node that provides
 * a file system interface using Helia MFS and OrbitDB.
 *
 * This maintains API compatibility with the old sailplane-node
 * to minimize changes in the rest of the codebase.
 */
class SharedFS {
  constructor(helia, orbitdb, db) {
    this.helia = helia;
    this.orbitdb = orbitdb;
    this.db = db;
    this.mfs = mfs(helia);
    this.unixfs = unixfs(helia);
    this.events = new EventEmitter();
    this.rootPath = '/r';

    // Listen for OrbitDB updates
    if (db) {
      db.events.on('update', () => {
        this.events.emit('updated');
      });
    }
  }

  /**
   * File system operations (accessed via sharedFS.fs.*)
   */
  get fs() {
    return {
      /**
       * List directory contents
       * @param {string} path - Directory path
       * @returns {Promise<string[]>} - Array of paths
       */
      ls: async (path) => {
        try {
          const entries = [];
          const mfsPath = this._toMfsPath(path);

          for await (const entry of this.mfs.ls(mfsPath)) {
            entries.push(`${path}/${entry.name}`);
          }
          return entries;
        } catch (error) {
          // Return empty array if directory doesn't exist
          if (error.code === 'ERR_NOT_FOUND') {
            return [];
          }
          throw error;
        }
      },

      /**
       * Get content type (file or dir)
       * @param {string} path - File/directory path
       * @returns {string} - 'file' or 'dir'
       */
      content: (path) => {
        // This will be populated from the ls() results
        // For now, check if path ends with a known extension
        const parts = path.split('/');
        const name = parts[parts.length - 1];
        if (name.includes('.')) {
          return 'file';
        }
        return 'dir';
      },
    };
  }

  /**
   * Convert app path to MFS path
   * /r/folder -> /folder
   */
  _toMfsPath(path) {
    if (path === '/r' || path === '/r/') {
      return '/';
    }
    return path.replace(/^\/r/, '') || '/';
  }

  /**
   * Upload files to directory
   * @param {string} directory - Target directory path
   * @param {AsyncIterable} source - File source iterable
   */
  async upload(directory, source) {
    const mfsDir = this._toMfsPath(directory);

    for await (const file of source) {
      const filePath = `${mfsDir}/${file.path}`.replace(/\/+/g, '/');

      // Ensure parent directories exist
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/')) || '/';
      try {
        await this.mfs.mkdir(parentDir, { parents: true });
      } catch (e) {
        // Ignore if already exists
      }

      // Write file content
      if (file.content) {
        const chunks = [];
        for await (const chunk of file.content) {
          chunks.push(chunk);
        }
        const content = new Uint8Array(
          chunks.reduce((acc, chunk) => [...acc, ...chunk], [])
        );
        await this.mfs.writeBytes(content, filePath, { create: true, parents: true });
      }
    }

    this.events.emit('updated');
  }

  /**
   * Create a directory
   * @param {string} parentPath - Parent directory path
   * @param {string} name - New directory name
   */
  async mkdir(parentPath, name) {
    const mfsPath = this._toMfsPath(parentPath);
    const fullPath = `${mfsPath}/${name}`.replace(/\/+/g, '/');
    await this.mfs.mkdir(fullPath, { parents: true });
    this.events.emit('updated');
  }

  /**
   * Read file CID
   * @param {string} path - File path
   * @returns {Promise<string>} - CID string
   */
  async read(path) {
    const mfsPath = this._toMfsPath(path);
    const stat = await this.mfs.stat(mfsPath);
    return stat.cid.toString();
  }

  /**
   * Move/rename a file or directory
   * @param {string} sourcePath - Source path
   * @param {string} destDir - Destination directory
   * @param {string} newName - New name
   */
  async move(sourcePath, destDir, newName) {
    const mfsSrc = this._toMfsPath(sourcePath);
    const mfsDest = this._toMfsPath(destDir);
    const destPath = `${mfsDest}/${newName}`.replace(/\/+/g, '/');
    await this.mfs.mv(mfsSrc, destPath);
    this.events.emit('updated');
  }

  /**
   * Remove a file or directory
   * @param {string} path - Path to remove
   */
  async remove(path) {
    const mfsPath = this._toMfsPath(path);
    await this.mfs.rm(mfsPath, { recursive: true });
    this.events.emit('updated');
  }
}

/**
 * Sailplane - Factory for creating SharedFS instances
 * Replaces @cypsela/sailplane-node
 */
class Sailplane {
  constructor(orbitdb) {
    this.orbitdb = orbitdb;
    this.helia = orbitdb.ipfs;
    this.instances = new Map();
  }

  static async create(orbitdb, options = {}) {
    return new Sailplane(orbitdb);
  }

  /**
   * Determine address for a new drive
   * @param {string} type - Drive type (e.g., 'superdrive')
   * @param {object} options - Options including meta.name
   * @returns {Promise<{toString: () => string}>}
   */
  async determineAddress(type, options = {}) {
    const name = options.meta?.name || 'default';
    const dbName = `sailplane-${name}-${Date.now()}`;

    // Create a documents database to store file metadata
    const db = await this.orbitdb.open(dbName, { type: 'documents' });
    const address = db.address;
    await db.close();

    return {
      toString: () => address,
      address,
    };
  }

  /**
   * Mount a drive at an address
   * @param {string|object} address - Drive address
   * @param {object} options - Mount options
   * @returns {Promise<SharedFS>}
   */
  async mount(address, options = {}) {
    const addressStr = typeof address === 'string' ? address : address.toString();

    // Check if already mounted
    if (this.instances.has(addressStr)) {
      return this.instances.get(addressStr);
    }

    // Open or create the OrbitDB database
    let db;
    try {
      db = await this.orbitdb.open(addressStr, { type: 'documents' });
    } catch (e) {
      // If opening fails, create a new one
      db = await this.orbitdb.open(addressStr, { type: 'documents' });
    }

    // Ensure root directory exists in MFS
    const heliaFs = mfs(this.helia);
    try {
      await heliaFs.mkdir('/', { parents: true });
    } catch (e) {
      // Ignore if exists
    }

    const sharedFS = new SharedFS(this.helia, this.orbitdb, db);
    this.instances.set(addressStr, sharedFS);

    return sharedFS;
  }
}

export { SharedFS, Sailplane };
export default Sailplane;
