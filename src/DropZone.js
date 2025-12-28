import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { primary5 } from './colors';
import useStore from './store/useStore';
import { encryptFile } from './utils/encryption';

/**
 * Convert a FileList/File array to an async iterable source
 * This replaces the @tabcat/file-list-source dependency
 */
async function* fileListToSource(files) {
  for (const file of files) {
    yield {
      path: file.path || file.name,
      content: (async function* () {
        const arrayBuffer = await file.arrayBuffer();
        yield new Uint8Array(arrayBuffer);
      })(),
    };
  }
}

export function DropZone({ children, sharedFs, currentDirectory }) {
  const styles = {
    container: {
      cursor: 'pointer',
      textAlign: 'center',
      color: primary5,
      fontSize: 16,
      fontWeight: 200,
      fontFamily: 'Open Sans',
      outline: 0,
      userSelect: 'none',
      height: '100%',
    },
  };

  const encryptionKey = useStore((state) => state.encryptionKey);
  const setStatus = useStore((state) => state.setStatus);

  const onDrop = useCallback(
    async (acceptedFiles) => {
      if (encryptionKey) {
        let encryptedFiles = [];
        let i = 0;
        for (let file of acceptedFiles) {
          i++;
          setStatus({
            message: `[${i}/${acceptedFiles.length}] Encrypting ${file.path}`,
          });

          const encryptedBlob = await encryptFile(file, encryptionKey.key);
          setStatus({});

          encryptedFiles.push(encryptedBlob);
        }
        acceptedFiles = encryptedFiles;
      }

      setStatus({ message: 'Uploading' });
      const listSource = fileListToSource(acceptedFiles);
      await sharedFs.current.upload(currentDirectory, listSource);
      setStatus({});
    },
    [currentDirectory, encryptionKey, setStatus, sharedFs],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });

  return (
    <div {...getRootProps()} style={styles.container}>
      <input {...getInputProps()} />
      {isDragActive ? <p>Drop the files here...</p> : <div>{children}</div>}
    </div>
  );
}
