import React, { useEffect, useState } from 'react';
import './App.css';
import { LeftPanel } from './LeftPanel';
import { useWindowSize } from './hooks/useWindowSize';
import useHelia from './hooks/useHelia';
import { LoadingRightBlock } from './LoadingRightBlock';
import { useParams } from 'react-router-dom';
import useStore from './store/useStore';
import { getBlobFromPathCID } from './utils/Utils';
import { saveAs } from 'file-saver';
import { DownloadPanel } from './DownloadPanel';

function Download() {
  const windowSize = useWindowSize();
  const windowWidth = windowSize.width;
  const heliaObj = useHelia();
  const [ready, setReady] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const [currentRightPanel, setCurrentRightPanel] = useState('files');
  const { cid, path } = useParams();
  const cleanPath = decodeURIComponent(path);
  const cleanCID = decodeURIComponent(cid);
  const setStatus = useStore((state) => state.setStatus);

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'row',
      height: '100%',
    },
  };

  useEffect(() => {
    if (heliaObj.isHeliaReady && !ready) {
      setReady(true);
    }
  }, [heliaObj.helia, heliaObj.isHeliaReady, ready]);

  const getDownload = async () => {
    setStatus({ message: 'Fetching file' });
    const blob = await getBlobFromPathCID(cleanCID, cleanPath, heliaObj.helia);
    setStatus({});

    const pathSplit = cleanPath.split('/');
    const name = pathSplit[pathSplit.length - 1];
    saveAs(blob, name);
    setDownloadComplete(true);
  };

  return (
    <div style={styles.container}>
      {windowWidth > 600 ? (
        <LeftPanel
          setCurrentRightPanel={setCurrentRightPanel}
          currentRightPanel={currentRightPanel}
        />
      ) : null}

      {ready ? (
        <DownloadPanel
          handleDownload={getDownload}
          ready={ready}
          path={cleanPath}
          downloadComplete={downloadComplete}
        />
      ) : (
        <LoadingRightBlock />
      )}
    </div>
  );
}

export default Download;
