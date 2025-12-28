import React, { useEffect, useState } from 'react';
import { primary, primary2, primary45, primary5 } from '../colors';
import { FaFolder } from 'react-icons/fa';
import { FiFile, FiLock } from 'react-icons/fi';
import { FiDownload, FiEdit, FiTrash, FiShare } from 'react-icons/fi';
import useHover from '../hooks/useHover';
import { ToolItem } from './ToolItem';
import { FilePreview } from './FilePreview';
import { Link } from 'react-router-dom';
import {
  getBlobFromPath,
  getFileExtensionFromFilename,
  getFileInfoFromCID,
  humanFileSize,
  isFileExtensionSupported,
  sha256,
} from '../utils/Utils';
import { saveAs } from 'file-saver';
import { Draggable } from 'react-beautiful-dnd';
import useTextInput from '../hooks/useTextInput';
import useStore from '../store/useStore';
import { decryptFile, getEncryptionInfoFromFilename } from '../utils/encryption';

export function FileItem({
  data,
  sharedFs,
  setCurrentDirectory,
  ipfs,
  fileIndex,
  isParent,
}) {
  const { path, type } = data;
  const pathSplit = path.split('/');
  const name = pathSplit[pathSplit.length - 1];
  const [hoverRef, isHovered] = useHover();
  const [CID, setCID] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [fileBlob, setFileBlob] = useState(null);
  const [enterPasswordMode, setEnterPasswordMode] = useState(false);
  const parentPath = pathSplit.slice(0, pathSplit.length - 1).join('/');
  const fileExtension = getFileExtensionFromFilename(name);
  const {
    isEncrypted,
    decryptedFilename,
    passHash,
  } = getEncryptionInfoFromFilename(name);

  const setStatus = useStore((state) => state.setStatus);

  const InputComponent = useTextInput(
    editMode,
    (editNameValue) => rename(editNameValue),
    () => setEditMode(false),
    name,
    {
      placeholder: '',
    },
  );

  const setDecryptPassword = async (password) => {
    let doesNotMatchHash = await doesPasswordFailHashCheck(password);
    if (!doesNotMatchHash) {
      setEnterPasswordMode(false);

      let blob = await getBlob();

      setStatus({ message: 'Decrypting file' });
      blob = await decryptFile(blob, password);
      setStatus({});

      if (!blob) {
        setStatus({
          message: 'Error decrypting file: Incorrect password!',
          isError: true,
        });
        setTimeout(() => {
          setStatus({});
        }, 3000);
      }

      saveAs(blob, decryptedFilename);
    }
  };

  const doesPasswordFailHashCheck = async (text) => {
    const hash = await sha256(text);
    const smallHash = hash.substr(0, 10);
    if (smallHash !== passHash) {
      return true;
    }
  };

  const PasswordInputComponent = useTextInput(
    enterPasswordMode,
    (password) => setDecryptPassword(password),
    () => setEnterPasswordMode(false),
    '',
    {
      placeholder: 'password',
      isPassword: true,
      isError: doesPasswordFailHashCheck,
    },
  );

  const styles = {
    outer: {
      border:
        isHovered || fileBlob ? `1px solid ${primary2}` : '1px solid #FFF',
      borderRadius: 4,
      color: primary5,
      fontSize: 14,
      padding: 7,
      marginBottom: 8,
      fontFamily: 'Open Sans',
    },
    container: {
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'space-between',

      cursor: 'pointer',
    },
    nameContainer: {
      width: '100%',
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'center',
    },
    icon: {
      marginRight: 4,
    },
    tools: {
      display: 'flex',
      justifyContent: 'flex-end',
      width: '100%',
      opacity:
        (isHovered || fileBlob || enterPasswordMode) && !isParent ? 1 : 0,
      fontSize: 14,
    },
  };

  let iconComponent = FiFile;

  if (type === 'dir') {
    iconComponent = FaFolder;
  }

  if (isEncrypted) {
    iconComponent = FiLock;
  }

  const getCID = async () => {
    const cid = await sharedFs.current.read(path);
    const fileInfo = await getFileInfoFromCID(cid, ipfs);
    setFileInfo(fileInfo);
    setCID(cid);
  };

  useEffect(() => {
    getCID();
  }, [path]);

  const IconComponent = iconComponent;

  const rename = async (editNameValue) => {
    try {
      setStatus({ message: 'Renaming file' });
      await sharedFs.current.move(path, parentPath, editNameValue);
      setStatus({});
    } catch (e) {
      console.log('Error moving!', e);
    }
  };

  function getStyle(style, snapshot) {
    if (!snapshot.isDragging) return {};
    if (!snapshot.isDropAnimating) {
      return style;
    }

    return {
      ...style,
      transitionDuration: `0.001s`,
    };
  }

  async function getBlob() {
    let blob;

    if (!fileBlob) {
      setStatus({ message: 'Fetching download' });
      blob = await getBlobFromPath(sharedFs, path, ipfs);
      setStatus({});
    } else {
      blob = fileBlob;
    }
    return blob;
  }

  const getContent = (snapshot) => {
    if (!snapshot) {
      snapshot = {};
    }

    return (
      <div
        style={{
          ...styles.outer,
          backgroundColor:
            snapshot.combineTargetFor && type === 'dir' ? primary2 : '#FFF',
        }}>
        <div
          style={styles.container}
          ref={hoverRef}
          onClick={async (event) => {
            event.stopPropagation();

            if (editMode) {
              return;
            }

            if (type === 'dir') {
              setCurrentDirectory(path);
            } else {
              if (!fileBlob && isFileExtensionSupported(fileExtension)) {
                setStatus({ message: 'Fetching preview' });
                const blob = await getBlobFromPath(sharedFs, path, ipfs);
                setStatus({});
                setFileBlob(blob);
              } else {
                setFileBlob(null);
              }
            }
          }}>
          <div style={styles.nameContainer}>
            <IconComponent color={primary45} size={16} style={styles.icon} />
            {editMode ? (
              <>{InputComponent}</>
            ) : isParent ? (
              '. . /'
            ) : isEncrypted ? (
              decryptedFilename
            ) : (
              name
            )}
          </div>
          <div style={styles.nameContainer}>
            {type !== 'dir' && fileInfo ? humanFileSize(fileInfo.size) : null}
          </div>
          <div style={styles.tools}>
            {!enterPasswordMode ? (
              <div>
                <Link
                  to={`/download/${encodeURIComponent(
                    CID,
                  )}/${encodeURIComponent(path)}`}
                  target={'_blank'}>
                  <ToolItem
                    iconComponent={FiShare}
                    changeColor={primary}
                    tooltip={'Share'}
                    onClick={async () => {}}
                  />
                </Link>

                <ToolItem
                  iconComponent={FiDownload}
                  changeColor={primary}
                  tooltip={'Download'}
                  onClick={async () => {
                    if (isEncrypted) {
                      setEnterPasswordMode(true);
                      return;
                    }

                    const blob = await getBlob();
                    saveAs(blob, name);
                  }}
                />

                <ToolItem
                  iconComponent={FiEdit}
                  changeColor={primary}
                  tooltip={'Rename'}
                  onClick={async () => {
                    setEditMode(true);
                  }}
                />

                <ToolItem
                  iconComponent={FiTrash}
                  tooltip={'Delete'}
                  onClick={async () => {
                    setStatus({
                      message: `Deleting ${
                        type === 'dir' ? 'folder' : 'file'
                      }`,
                    });
                    await sharedFs.current.remove(path);
                    setStatus({});
                  }}
                />
              </div>
            ) : (
              <>{PasswordInputComponent}</>
            )}
          </div>
        </div>
        {fileBlob ? (
          <div style={styles.preview}>
            <FilePreview blob={fileBlob} filename={name} />
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <Draggable draggableId={path} index={fileIndex}>
      {({ innerRef, draggableProps, dragHandleProps }, snapshot) => {
        return (
          <div
            ref={innerRef}
            {...draggableProps}
            {...dragHandleProps}
            style={getStyle(draggableProps.style, snapshot)}>
            {getContent(snapshot)}
          </div>
        );
      }}
    </Draggable>
  );
}
